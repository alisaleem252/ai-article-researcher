const DEFAULT_BASE = 'https://app.rapidtextai.com/openai';

export class RapidTextAIError extends Error {
  constructor(message, { status, code, type } = {}) {
    super(message);
    this.name = 'RapidTextAIError';
    this.status = status;
    this.code = code;
    this.type = type;
  }
}

export class RapidTextAI {
  constructor({ apiKey, baseUrl } = {}) {
    this.apiKey = apiKey || process.env.RAPIDTEXTAI_API_KEY;
    this.baseUrl = (baseUrl || process.env.RAPIDTEXTAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '');
    if (!this.apiKey) {
      throw new RapidTextAIError(
        'Missing API key. Set RAPIDTEXTAI_API_KEY in .env (see .env.example) or pass --key.'
      );
    }
  }

  /**
   * Build a request URL. The key is also sent as ?gigsixkey= because the production server currently
   * ignores the Authorization header (verified live on 2026-11-08); the Bearer header is still sent too.
   */
  _url(path) {
    const u = new URL(`${this.baseUrl}${path}`);
    u.searchParams.set('gigsixkey', this.apiKey);
    return u.toString();
  }

  _headers(extra = {}) {
    return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...extra };
  }

  async _fail(res) {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    const e = body?.error || {};
    const hint = {
      401: 'Check that your API key is correct.',
      429: 'An article is already being generated for this account. Wait for it to finish.',
    }[res.status];
    throw new RapidTextAIError(
      [e.message || `HTTP ${res.status}`, hint].filter(Boolean).join(' '),
      { status: res.status, code: e.code, type: e.type }
    );
  }

  /** Feature detection: which research/image/video features the server has configured. */
  async capabilities() {
    const res = await fetch(this._url(`/v2/article/capabilities`), { headers: this._headers() });
    if (!res.ok) await this._fail(res);
    return res.json();
  }

  /** List models available to your key. */
  async models() {
    const res = await fetch(this._url(`/v1/models`), { headers: this._headers() });
    if (!res.ok) await this._fail(res);
    return res.json();
  }

  /**
   * Generate an article. Resolves with the full article object.
   * Pass onEvent to receive live progress events (stage, outline, section, ...).
   * Takes 1-3 minutes; streaming keeps the connection alive.
   */
  async generate(params, { onEvent, signal } = {}) {
    if (!params?.topic) throw new RapidTextAIError('A topic is required.');
    const res = await fetch(this._url(`/v2/article/generate`), {
      method: 'POST',
      headers: this._headers({ Accept: 'text/event-stream' }),
      body: JSON.stringify({ ...params, stream: true }),
      signal,
    });
    if (!res.ok) await this._fail(res);

    let result = null;
    for await (const evt of parseSSE(res.body)) {
      if (evt.type === 'error') {
        const e = evt.error || {};
        throw new RapidTextAIError(e.message || 'Generation failed', { code: e.code, type: e.type });
      }
      if (evt.type === 'result') result = evt.data;
      onEvent?.(evt);
    }
    if (!result) throw new RapidTextAIError('The stream ended without returning an article.');
    return result;
  }
}

/** Parse a text/event-stream body into JSON objects. Ends at `data: [DONE]`. */
export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of body) {
    buf += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      if (!data) continue;
      try { yield JSON.parse(data); } catch { /* ignore partial/keep-alive lines */ }
    }
  }
}
