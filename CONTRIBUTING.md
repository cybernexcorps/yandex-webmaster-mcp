# Contributing

Thanks for your interest! This server is intentionally small and registry-driven.

## Setup

```bash
npm install
npm run build
```

## Adding a tool

Add one `EndpointDef` record to `src/endpoints.ts`. No framework changes are needed —
`server.ts` registers every record automatically. A record specifies:

- `name`, `description` (prefix mutating tools with `[mutating]`)
- `method` and `path` (use `{user_id}`, `{host_id}`, and `{param}` placeholders)
- `inputSchema` (Zod). Use the shared `hostInput` if the tool takes a host.
- `query` / `body` / `pathParams` arrays routing inputs to the right place
- add `...confirmField` to the schema and rely on the confirm-gate for writes

## Testing

```bash
npm run build           # must be clean
SMOKE_HOST=yourhost.tld YANDEX_WEBMASTER_TOKEN=… npm run smoke
```

The smoke test hits the live API. Read-only tools should PASS; write tools should show
`DRY` (a write tool that requires an extra argument such as a sitemap UUID will SKIP instead). There are no mocks by design.

## Conventions

- TypeScript strict mode; ESM with `.js` import specifiers.
- Keep secrets out of code and docs — the token comes only from the environment.
- Don't hardcode account-specific hosts in committed code or tests.
