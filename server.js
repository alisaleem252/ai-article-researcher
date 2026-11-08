import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './src/env.js';
import { RapidTextAI, RapidTextAIError } from './src/client.js';

loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// The key comes from .env, or from the browser (kept in localStorage, sent only to this local server).
const clientFor = (req) => new RapidTextAI({ apiKey: req.headers['x-api-key'] || undefined });

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
      return res.end(await readFile(join(__dirname, 'public', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/config') {
      return json(res, 200, { hasServerKey: Boolean(process.env.RAPIDTEXTAI_API_KEY) });
    }
    if (req.method === 'GET' && url.pathname === '/api/models') {
      return json(res, 200, await clientFor(req).models());
    }
    if (req.method === 'POST' && url.pathname === '/api/generate') {
      const params = JSON.parse((await readBody(req)) || '{}');
      const client = clientFor(req);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const ac = new AbortController();
      res.on('close', () => ac.abort());
      const send = (o) => res.write(`data: ${JSON.stringify(o)}\n\n`);
      try {
        const article = await client.generate(params, { onEvent: (e) => e.type !== 'result' && send(e), signal: ac.signal });
        send({ type: 'result', data: article });
      } catch (e) {
        if (!ac.signal.aborted) send({ type: 'error', error: { message: e.message } });
      }
      return res.end();
    }
    json(res, 404, { error: { message: 'Not found' } });
  } catch (e) {
    const status = e instanceof RapidTextAIError ? (e.status || 400) : 500;
    if (!res.headersSent) json(res, status, { error: { message: e.message } });
    else res.end();
  }
});

// Bound to localhost only: this server holds your API key.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI Article Researcher running at http://localhost:${PORT}`);
  if (!process.env.RAPIDTEXTAI_API_KEY) console.log('No RAPIDTEXTAI_API_KEY in .env; you can paste your key in the page instead.');
});
