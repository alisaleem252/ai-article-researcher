import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function toHtmlPage(a) {
  const faq = (a.faq || []).length
    ? `<h2>FAQ</h2>\n${a.faq.map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n')}\n`
    : '';
  const sources = (a.sources || []).length
    ? `<h2>Sources</h2>\n<ul>\n${a.sources.map((s) => `<li><a href="${esc(s.url)}" rel="noopener">${esc(s.title || s.url)}</a></li>`).join('\n')}\n</ul>\n`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(a.title)}</title>
<meta name="description" content="${esc(a.meta_description || '')}">
<style>body{max-width:760px;margin:2rem auto;padding:0 1rem;font:17px/1.65 system-ui,sans-serif;color:#222}img{max-width:100%}</style>
</head><body>
<h1>${esc(a.title)}</h1>
${a.body_html || ''}
${faq}${sources}</body></html>
`;
}

export function toMarkdown(a) {
  const parts = [`# ${a.title}`, '', a.body_markdown || ''];
  if (a.faq?.length) {
    parts.push('', '## FAQ', '');
    for (const f of a.faq) parts.push(`### ${f.q}`, '', f.a, '');
  }
  if (a.sources?.length) {
    parts.push('', '## Sources', '');
    for (const s of a.sources) parts.push(`- [${s.title || s.url}](${s.url})`);
  }
  return parts.join('\n') + '\n';
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'article';
}

/** Write the article to dir in the requested formats. Returns the file paths. */
export async function saveArticle(a, dir, formats = ['md', 'html', 'json']) {
  await mkdir(dir, { recursive: true });
  const base = join(dir, a.slug || slugify(a.title));
  const out = [];
  const w = async (ext, text) => { await writeFile(`${base}.${ext}`, text); out.push(`${base}.${ext}`); };
  if (formats.includes('md')) await w('md', toMarkdown(a));
  if (formats.includes('html')) await w('html', toHtmlPage(a));
  if (formats.includes('json')) await w('json', JSON.stringify(a, null, 2));
  return out;
}
