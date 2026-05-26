# Changelog

## 1.0.0 — 2026-05-26

Initial public release.

- 29 tools covering the Yandex Webmaster v4 API: hosts, diagnostics, indexing & SQI,
  search-URL events, sitemaps, important URLs, recrawl, search queries, and links.
- Friendly host-name resolution (ASCII + IDN) with scheme disambiguation.
- Confirm-gated mutating writes with dry-run previews.
- `error_code` → hint mapping and retrying HTTP client.

Greenfield rewrite inspired by `@theyahia/yandex-webmaster-mcp` (3 tools); fixes the
`Bearer`→`OAuth` auth header and URL base-path bugs from that package.
