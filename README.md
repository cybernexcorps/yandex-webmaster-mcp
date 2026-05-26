# Yandex Webmaster MCP

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
**Yandex Webmaster v4 API** as 29 tools — diagnostics, indexing, SQI, sitemaps, recrawl,
search-query analytics, and backlinks — so an AI assistant can run day-to-day technical SEO
on your Yandex-registered sites.

## Features

- **29 tools** spanning the full read surface of the Webmaster v4 API plus the key write
  operations (add host, add/remove sitemap, request recrawl).
- **Friendly host names** — call tools with `example.com` or `пример.рф` instead of raw
  `host_id` strings like `http:example.com:80`. ASCII and Unicode (IDN) forms both resolve;
  prefix with a scheme (`https://…`) to disambiguate when both variants are registered.
- **Safe writes** — every mutating tool requires `confirm: true`. Without it you get a
  dry-run preview of the exact request that *would* be sent.
- **Helpful errors** — common Yandex `error_code`s are mapped to actionable hints
  (bad token, unverified host, rate limit, recrawl quota).
- **Resilient HTTP** — 15s timeout, 3× exponential-backoff retry on 429/5xx.
- **Registry-driven** — adding an endpoint is one record in `src/endpoints.ts`.

## Prior art

This is a greenfield rewrite inspired by
[`@theyahia/yandex-webmaster-mcp`](https://www.npmjs.com/package/@theyahia/yandex-webmaster-mcp).
That package exposed 3 tools and shipped two bugs (a `Bearer` auth header where Yandex
requires `OAuth`, and a URL base-path resolution error). This project expands to 29 tools and
a registry-driven architecture. Thanks to the original author for the starting point.

## Getting a Yandex OAuth token

1. Create an application at <https://oauth.yandex.com/> and grant it the **Yandex.Webmaster**
   permission.
2. Obtain an OAuth token for that app (it is long-lived).
3. Keep it secret. This server reads it from the `YANDEX_WEBMASTER_TOKEN` environment
   variable and sends it as `Authorization: OAuth <token>` — **not** `Bearer`.

## Install & run

### Via npx (recommended)

```bash
npx @cybernexcorps/yandex-webmaster-mcp
```

### From source

```bash
git clone https://github.com/cybernexcorps/yandex-webmaster-mcp.git
cd yandex-webmaster-mcp
npm install
npm run build
node dist/server.js
```

## MCP client configuration

The server speaks MCP over stdio. Point your client at the `npx` command (or
`node /abs/path/dist/server.js`) and pass the token via env.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "yandex-webmaster": {
      "command": "npx",
      "args": ["-y", "@cybernexcorps/yandex-webmaster-mcp"],
      "env": {
        "YANDEX_WEBMASTER_TOKEN": "your-oauth-token"
      }
    }
  }
}
```

**Cursor / generic stdio client** — same shape: `command` + `args` + `env`.

## Tool catalog

| Category | Tools |
|----------|-------|
| **Hosts** | `get_hosts`, `get_host_info`, `get_host_summary`, `add_host` *(write)* |
| **Diagnostics** | `get_diagnostics` |
| **Indexing & SQI** | `get_indexing_history`, `get_indexing_samples`, `get_insearch_samples`, `get_insearch_history`, `get_sqi_history` |
| **Search-URL events** | `get_search_url_events_samples`, `get_search_url_events_history` |
| **Sitemaps** | `get_sitemaps`, `get_sitemap_info`, `get_sitemap_urls`, `add_user_sitemap` *(write)*, `delete_user_sitemap` *(write)* |
| **Important URLs** | `get_important_urls`, `get_important_url_history` |
| **Recrawl** | `request_recrawl` *(write)*, `get_recrawl_queue`, `get_recrawl_quota` |
| **Search queries** | `get_popular_queries`, `get_queries_history` |
| **Links** | `get_external_links_samples`, `get_external_links_history`, `get_internal_broken_samples`, `get_internal_broken_history` |
| **Local** | `refresh_hosts` (busts the in-process hosts cache; no API call) |

Write tools return a dry-run preview unless called with `confirm: true`.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `YANDEX_WEBMASTER_TOKEN` | yes | Yandex OAuth token |
| `SMOKE_HOST` | no | Host for `npm run smoke`; set to a host registered in YOUR Yandex account for a meaningful run (defaults to `example.com`) |
| `SMOKE_BAD_TOKEN` | no | `1` to assert the bad-token error hint |
| `SMOKE_IDN_HOST` | no | A Unicode host you own, to exercise IDN resolution in the smoke test |
| `SMOKE_IDN_PUNYCODE` | no | Substring the resolved IDN `host_id` must contain |

## Development

```bash
npm install
npm run dev      # run from TS source via tsx
npm run build    # tsc → dist/
npm run smoke    # live API smoke test (needs a valid token + SMOKE_HOST)
```

## License

MIT © 2026 Slava Pospelov
