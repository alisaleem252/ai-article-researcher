# AI Article Researcher

Generate researched, SEO-ready articles from your terminal or a local web page, using your own [RapidTextAI](https://app.rapidtextai.com) API key.

For each topic it runs a full pipeline on the RapidTextAI backend:

```
brief → live web research → outline → section-by-section draft → editor pass → FAQ + metadata → quality checks
```

You get back a title, slug, meta description, HTML and Markdown body, FAQ, the sources the article actually links to, tags, and a quality score. Nothing to configure beyond the API key: no other services or dependencies.

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- A RapidTextAI account and API key (find it in your dashboard at <https://app.rapidtextai.com>)

## Install

```bash
git clone https://github.com/alisaleem252/ai-article-researcher.git
cd ai-article-researcher
cp .env.example .env        # Windows: copy .env.example .env
```

Open `.env` and paste your key:

```
RAPIDTEXTAI_API_KEY=your-api-key-here
```

There are no packages to install (`npm install` is not needed).

## Usage

### Option 1: Web page

```bash
npm start
```

Open <http://localhost:3000>, enter a topic and press **Generate**. You'll see live progress, then the finished article, which you can copy as HTML or Markdown or download. If you skipped `.env`, the page asks for your key and keeps it in your browser only. The server listens on `127.0.0.1` only, so it isn't exposed to your network.

### Option 2: Command line

```bash
node bin/cli.js "budget planning for small teams"
```

Files are written to `./output/` as `.md`, `.html` and `.json`.

More examples:

```bash
# Longer article with a specific keyword, tone and audience
node bin/cli.js "remote team onboarding" -k "employee onboarding" -w 2000 -t "friendly, practical" -a "HR managers"

# Many topics, one per line (lines starting with # are ignored)
node bin/cli.js --file topics.txt -o ./articles

# Skip live research (faster), HTML output only
node bin/cli.js "history of coffee" --no-research -f html

# See which models and features your account can use
node bin/cli.js --models
node bin/cli.js --capabilities
```

Optionally link it as a global command: `npm link`, then run `article-researcher "your topic"`.

| Option | Description |
|---|---|
| `-k, --keyword` | Primary keyword (defaults to the topic) |
| `-w, --words` | Target length, 300-4000 (default 1500) |
| `-t, --tone`, `-l, --language`, `-a, --audience` | Writing style controls |
| `--type` | `guide`, `how-to`, `listicle`, `comparison`, `review`, `pillar`, `news` |
| `-m, --model` / `--helper-model` | Drafting model / cheaper model for research and outline |
| `--cta` | Call to action to close the article with |
| `--site-url` | Your site: excluded from research and used for links |
| `--no-research`, `--no-faq`, `--no-sources` | Turn parts of the pipeline off |
| `--images`, `--videos` | Embed relevant images / videos (needs those features on the server; check `--capabilities`) |
| `--brand-id` | Use a brand voice saved in your RapidTextAI account |
| `-o, --out`, `-f, --format` | Output folder and formats (`md,html,json`) |
| `--key` | Use this API key instead of `.env` |
| `--json` | Print the raw JSON result |

### Option 3: Use it as a library

```js
import { RapidTextAI } from './src/client.js';

const client = new RapidTextAI({ apiKey: process.env.RAPIDTEXTAI_API_KEY });
const article = await client.generate(
  { topic: 'budget planning for small teams', word_count: 1500 },
  { onEvent: (e) => e.type === 'stage' && console.log(e.stage, e.status) }
);
console.log(article.title, article.body_html);
```

## Good to know

- **Cost:** each article uses 6 request units from your RapidTextAI plan. Failed generations are refunded.
- **Time:** typically 1-3 minutes per article. The tool streams progress so you can watch it work.
- **One at a time:** the API runs one generation per account at once, so batch mode processes topics sequentially. A second simultaneous request returns HTTP 429.
- **Check the output:** the quality checks flag invented statistics and weak structure, but you should still review articles before publishing. Images found by search belong to their owners; review them before publishing.

## Troubleshooting

| Message | Fix |
|---|---|
| `Missing API key` | Create `.env` from `.env.example` and set `RAPIDTEXTAI_API_KEY`, or pass `--key`. |
| `401` | The key is wrong or revoked. Copy it again from your dashboard. |
| `429` | An article is already generating on your account. Wait for it to finish. |
| `research` warning in the result | Live research isn't enabled on the server; the article was written without it. |

## Development

```bash
npm test      # offline tests using a local mock server, no API key needed
```

Layout: `src/client.js` (API client + SSE parser), `src/output.js` (file writers), `bin/cli.js` (CLI), `server.js` + `public/index.html` (local web UI).

## API reference

This tool wraps the RapidTextAI v2 article endpoints at `https://app.rapidtextai.com/openai`:

- `POST /v2/article/generate`: generate an article (streams Server-Sent Events)
- `GET /v2/article/capabilities`: feature detection
- `GET /v1/models`: available models

Authentication is `Authorization: Bearer <key>`. Override the base URL with `RAPIDTEXTAI_BASE_URL` if needed.
