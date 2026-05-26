# Architecture

A small, registry-driven TypeScript MCP server compiled to ESM and run over stdio.

## Files

- `src/endpoints.ts` — a declarative registry: one `EndpointDef` record per tool
  (name, description, HTTP method, path template, Zod input schema, and which inputs
  route to query string / JSON body / path params).
- `src/client.ts` — HTTP layer: `OAuth` auth header, 15s timeout, 3× exponential-backoff
  retry on 429/5xx, friendly-host → `host_id` resolution with scheme disambiguation,
  `error_code` → hint mapping, and the confirm-gate for mutating writes.
- `src/server.ts` — MCP boilerplate: iterates the registry and registers each record as a
  tool, wrapping results/errors into MCP content.
- `src/smoke-test.ts` — standalone live-API tester that exercises every read-only tool once
  and verifies the dry-run shape of every write tool.

## Data flow per tool call

1. The client invokes a tool, e.g. `get_diagnostics` with `{ host: "example.com" }`.
2. `server.ts` finds the matching `EndpointDef` and calls `client.callEndpoint(ep, params)`.
3. `client.ts` validates input with the endpoint's Zod schema, resolves `host` → `host_id`
   via a lazily built cache, interpolates `{user_id}`/`{host_id}`/path params into the path,
   and attaches `Authorization: OAuth <token>`.
4. `fetch()` runs with retry; on 4xx the `error_code` is mapped to a friendly hint and thrown.
5. The JSON response is returned to the caller as MCP text content.

## Host resolution

The hosts cache is a `Map<string, HostEntry[]>` keyed by the lowercased hostname (scheme,
port, and trailing slash stripped), built on first lookup from `GET /user/{user_id}/hosts/`.
Both ASCII (`example.com`) and Unicode (`пример.рф`) forms are inserted as keys pointing at
the same entry, so either input works. If a hostname has multiple registered variants
(e.g. both http and https), the caller passes a scheme prefix to disambiguate.

## Mutating writes

`POST`/`PATCH`/`DELETE` tools return a `{ dry_run: true, would_call, params, body, query }`
preview unless called with `confirm: true`. The preview is produced *after* path
interpolation, so it shows the real URL that would be hit.

## Configuration

A single environment variable, `YANDEX_WEBMASTER_TOKEN`. The numeric `user_id` is resolved
once at startup via `GET /user/`; startup fails fast with a clear message if the token is
rejected. Single account per process.
