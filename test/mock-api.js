// Offline demo: runs the web UI against a fake RapidTextAI API so you can try the
// interface without an API key or spending units. Output is canned sample text.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const sample = {
  title: 'Budget Planning for Small Teams: A Practical Guide',
  slug: 'budget-planning-for-small-teams',
  meta_description: 'A practical, step-by-step approach to building and tracking a budget for a small team.',
  body_html: '<p>Every small team eventually hits the same wall: money is coming in, money is going out, and nobody is quite sure where it goes. A simple budget fixes that.</p><h2>1. Start with what you actually spend</h2><p>Pull the last three months of expenses and group them into a handful of categories. Real numbers beat estimates.</p><h2>2. Set limits per category</h2><p>Give each category a monthly ceiling, and leave a small buffer for surprises.</p><h2>3. Review on a fixed schedule</h2><p>A fifteen-minute monthly review keeps the budget honest and gives the team a chance to adjust.</p>',
  body_markdown: '## 1. Start with what you actually spend\n\n...',
  faq: [{ q: 'How often should a small team review its budget?', a: 'Monthly is a good default, with a quick check after any large purchase.' },
        { q: 'What tools do I need?', a: 'A shared spreadsheet is enough to begin with.' }],
  sources: [{ title: 'Example source', url: 'https://example.com' }],
  word_count: 1480, quality: { score: 95 }, warnings: [],
};
const stages = ['brief', 'research', 'outline', 'draft', 'edit', 'metadata', 'finalize'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = createServer(async (req, res) => {
  if (req.url.includes('/v1/models')) { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }, { id: 'deepseek-chat' }] })); }
  if (req.url.includes('/v2/article/generate')) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
    for (const stage of stages) { send({ type: 'stage', stage, status: 'start' }); await sleep(Number(process.env.MOCK_DELAY ?? 500)); }
    send({ type: 'result', data: sample });
    return res.end('data: [DONE]\n\n');
  }
  res.writeHead(404); res.end();
}).listen(0, '127.0.0.1', () => {
  const env = { ...process.env, RAPIDTEXTAI_API_KEY: 'demo-key', RAPIDTEXTAI_BASE_URL: `http://127.0.0.1:${api.address().port}/openai` };
  console.log('DEMO MODE: using a fake API with sample text. No key or units needed.');
  const ui = spawn(process.execPath, ['server.js'], { env, stdio: 'inherit' });
  ui.on('exit', () => process.exit());
});
