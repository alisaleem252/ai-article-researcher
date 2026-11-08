import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RapidTextAI, parseSSE } from '../src/client.js';
import { toMarkdown, slugify } from '../src/output.js';

test('parseSSE yields JSON events and stops at [DONE]', async () => {
  const body = (async function* () {
    yield Buffer.from('data: {"type":"stage","stage":"research","status":"start"}\n\ndata: {"ty');
    yield Buffer.from('pe":"result","data":{"title":"T"}}\n\ndata: [DONE]\n\ndata: {"type":"x"}\n\n');
  })();
  const out = []; for await (const e of parseSSE(body)) out.push(e);
  assert.deepEqual(out.map((e) => e.type), ['stage', 'result']);
});

test('generate() sends bearer auth + stream flag and returns the result', async () => {
  let seen;
  const srv = createServer((req, res) => {
    let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
      seen = { auth: req.headers.authorization, url: req.url, body: JSON.parse(b) };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('data: {"type":"section","index":1,"of":1,"heading":"H","html":"<p>x</p>"}\n\n');
      res.write('data: {"type":"result","data":{"title":"Hello","slug":"hello"}}\n\n');
      res.end('data: [DONE]\n\n');
    });
  }).listen(0);
  const { port } = srv.address();
  const c = new RapidTextAI({ apiKey: 'k-1', baseUrl: `http://127.0.0.1:${port}/openai` });
  const events = [];
  const a = await c.generate({ topic: 'x' }, { onEvent: (e) => events.push(e.type) });
  srv.close();
  assert.equal(a.title, 'Hello');
  assert.equal(seen.auth, 'Bearer k-1');
  assert.equal(seen.url, '/openai/v2/article/generate');
  assert.equal(seen.body.stream, true);
  assert.deepEqual(events, ['section', 'result']);
});

test('errors surface the API message', async () => {
  const srv = createServer((_, res) => { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"bad key"}}'); }).listen(0);
  const c = new RapidTextAI({ apiKey: 'x', baseUrl: `http://127.0.0.1:${srv.address().port}` });
  await assert.rejects(c.generate({ topic: 't' }), /bad key/);
  srv.close();
});

test('missing key throws a helpful error', () => {
  const old = process.env.RAPIDTEXTAI_API_KEY; delete process.env.RAPIDTEXTAI_API_KEY;
  assert.throws(() => new RapidTextAI(), /Missing API key/);
  if (old) process.env.RAPIDTEXTAI_API_KEY = old;
});

test('output helpers', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.match(toMarkdown({ title: 'T', body_markdown: 'b', faq: [{ q: 'Q', a: 'A' }], sources: [{ title: 'S', url: 'u' }] }), /## FAQ[\s\S]*## Sources/);
});
