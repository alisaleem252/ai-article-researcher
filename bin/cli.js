#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { loadEnv } from '../src/env.js';
import { RapidTextAI, RapidTextAIError } from '../src/client.js';
import { saveArticle } from '../src/output.js';

loadEnv();

const HELP = `Usage:
  article-researcher "<topic>" [options]
  article-researcher --file topics.txt [options]     one topic per line
  article-researcher --capabilities | --models

Options:
  -k, --keyword <text>      Primary keyword (defaults to the topic)
  -w, --words <n>           Target length, 300-4000 (default 1500)
  -t, --tone <text>         e.g. "friendly, practical"
  -l, --language <text>     default English
  -a, --audience <text>     e.g. "small business owners"
      --type <type>         guide|how-to|listicle|comparison|review|pillar|news
  -m, --model <id>          Model for drafting (see --models)
      --helper-model <id>   Cheaper model for research/outline/FAQ
      --cta <text>          Call to action to close with
      --site-url <url>      Your site (excluded from research, used for links)
      --no-research         Skip live web research
      --no-faq              Skip FAQ section
      --no-sources          Skip sources list
      --images              Embed relevant images (needs server image search)
      --videos              Embed relevant videos
      --brand-id <id>       Use a brand saved in your RapidTextAI account
  -o, --out <dir>           Output folder (default ./output)
  -f, --format <list>       md,html,json (default all three)
      --key <api-key>       Override RAPIDTEXTAI_API_KEY
      --json                Print the raw JSON result to stdout
  -q, --quiet               No progress output
  -h, --help

Each article costs 6 request units on your RapidTextAI plan.`;

let opts, positionals;
try {
  ({ values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      keyword: { type: 'string', short: 'k' }, words: { type: 'string', short: 'w' },
      tone: { type: 'string', short: 't' }, language: { type: 'string', short: 'l' },
      audience: { type: 'string', short: 'a' }, type: { type: 'string' },
      model: { type: 'string', short: 'm' }, 'helper-model': { type: 'string' },
      cta: { type: 'string' }, 'site-url': { type: 'string' },
      'no-research': { type: 'boolean' }, 'no-faq': { type: 'boolean' }, 'no-sources': { type: 'boolean' },
      images: { type: 'boolean' }, videos: { type: 'boolean' }, 'brand-id': { type: 'string' },
      out: { type: 'string', short: 'o', default: 'output' }, format: { type: 'string', short: 'f', default: 'md,html,json' },
      key: { type: 'string' }, file: { type: 'string' }, json: { type: 'boolean' },
      quiet: { type: 'boolean', short: 'q' }, capabilities: { type: 'boolean' }, models: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  }));
} catch (e) {
  console.error(e.message + '\n\n' + HELP);
  process.exit(2);
}

if (opts.help || (!positionals.length && !opts.file && !opts.capabilities && !opts.models)) {
  console.log(HELP);
  process.exit(opts.help ? 0 : 2);
}

const log = (...a) => { if (!opts.quiet && !opts.json) console.error(...a); };

function buildParams(topic) {
  const p = { topic };
  if (opts.keyword) p.keyword = opts.keyword;
  if (opts.words) {
    const n = Number(opts.words);
    if (!Number.isInteger(n) || n < 300 || n > 4000) throw new RapidTextAIError('--words must be an integer from 300 to 4000.');
    p.word_count = n;
  }
  if (opts.tone) p.tone = opts.tone;
  if (opts.language) p.language = opts.language;
  if (opts.audience) p.audience = opts.audience;
  if (opts.type) p.article_type = opts.type;
  if (opts.model) p.model = opts.model;
  if (opts['helper-model']) p.helper_model = opts['helper-model'];
  if (opts.cta) p.cta = opts.cta;
  if (opts['site-url']) p.site_url = opts['site-url'];
  if (opts['no-research']) p.research = false;
  if (opts['no-faq']) p.include_faq = false;
  if (opts['no-sources']) p.include_sources = false;
  if (opts.images) p.include_images = true;
  if (opts.videos) p.embed_videos = true;
  if (opts['brand-id']) p.brand_id = Number(opts['brand-id']);
  return p;
}

function progress(evt) {
  switch (evt.type) {
    case 'stage': if (evt.status === 'start') log(`• ${evt.stage}...`); break;
    case 'progress': log(`    ${evt.detail ?? ''}`); break;
    case 'outline': log(`  Outline: ${evt.title}\n${(evt.sections || []).map((s) => `    - ${s}`).join('\n')}`); break;
    case 'section': log(`  ✓ section ${evt.index}/${evt.of}: ${evt.heading || 'introduction'}`); break;
  }
}

const ac = new AbortController();
process.on('SIGINT', () => { ac.abort(); console.error('\nCancelled.'); process.exit(130); });

try {
  const client = new RapidTextAI({ apiKey: opts.key });

  if (opts.capabilities) { console.log(JSON.stringify(await client.capabilities(), null, 2)); process.exit(0); }
  if (opts.models) { console.log(JSON.stringify(await client.models(), null, 2)); process.exit(0); }

  let topics = [...positionals];
  if (opts.file) {
    const lines = (await readFile(opts.file, 'utf8')).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    topics.push(...lines);
  }

  const formats = opts.format.split(',').map((s) => s.trim());
  let failures = 0;
  // One at a time: the API allows a single running generation per account.
  for (const [i, topic] of topics.entries()) {
    log(`\n[${i + 1}/${topics.length}] ${topic}`);
    try {
      const t0 = Date.now();
      const article = await client.generate(buildParams(topic), { onEvent: progress, signal: ac.signal });
      if (opts.json) console.log(JSON.stringify(article, null, 2));
      const files = await saveArticle(article, opts.out, formats);
      log(`\nDone in ${Math.round((Date.now() - t0) / 1000)}s: "${article.title}" (${article.word_count} words, quality ${article.quality?.score ?? 'n/a'})`);
      for (const f of files) log(`  ${f}`);
      for (const w of article.warnings || []) log(`  warning: ${typeof w === 'string' ? w : JSON.stringify(w)}`);
    } catch (e) {
      failures++;
      console.error(`Failed "${topic}": ${e.message}`);
      if (e.status === 401) process.exit(1);
    }
  }
  process.exit(failures ? 1 : 0);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
