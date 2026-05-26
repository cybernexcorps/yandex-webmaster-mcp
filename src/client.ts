// src/client.ts
import type { z } from "zod";

const BASE_URL = "https://api.webmaster.yandex.net/v4/";
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

const ERROR_HINTS: Record<string, string> = {
  INVALID_OAUTH_TOKEN: "Token rejected. Check YANDEX_WEBMASTER_TOKEN; auth scheme must be 'OAuth', not 'Bearer'.",
  HOST_NOT_VERIFIED: "This host isn't verified in Webmaster yet. Verify ownership first.",
  TOO_MANY_REQUESTS: "Rate-limited. Yandex Webmaster API allows ~5 req/sec.",
  RECRAWL_QUOTA_EXCEEDED: "Daily recrawl quota used up. Quota resets at midnight Moscow time.",
};

function getToken(): string {
  const t = process.env.YANDEX_WEBMASTER_TOKEN;
  if (!t) throw new Error("YANDEX_WEBMASTER_TOKEN env var is required");
  return t;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        console.error(`[yandex-webmaster-mcp] ${res.status} from ${url}, retry in ${delay}ms (${attempt}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      const body = await res.text().catch(() => "");
      let errCode = "";
      try { errCode = JSON.parse(body).error_code ?? ""; } catch { /* body not JSON */ }
      const hint = errCode && ERROR_HINTS[errCode] ? ERROR_HINTS[errCode] : "";
      // Raw body on stderr for the operator; sanitized error to the MCP caller.
      console.error(`[yandex-webmaster-mcp] HTTP ${res.status} ${errCode} body=${body.slice(0, 500)}`);
      throw new Error(`HTTP ${res.status}${errCode ? " " + errCode : ""}${hint ? ": " + hint : ""}`);
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt === MAX_RETRIES) throw e;
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      if (e instanceof DOMException && e.name === "AbortError") {
        console.error(`[yandex-webmaster-mcp] timeout, retry ${attempt}/${MAX_RETRIES} in ${delay}ms`);
      } else {
        console.error(`[yandex-webmaster-mcp] network error (${(e as Error).message}), retry ${attempt}/${MAX_RETRIES} in ${delay}ms`);
      }
      await sleep(delay);
      continue;
    }
  }
  throw lastErr ?? new Error("Exhausted retries");
}

export async function rawCall(method: string, path: string, query?: Record<string, string>, body?: unknown): Promise<unknown> {
  const url = new URL(path.replace(/^\//, ""), BASE_URL);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  const res = await fetchWithRetry(url.toString(), {
    method,
    headers: {
      Authorization: `OAuth ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

let userId: number | null = null;

export async function init(): Promise<void> {
  // Validate token + resolve user_id once at startup.
  // Fails fast with a clear error so every subsequent call doesn't blow up the same way.
  try {
    const data = await rawCall("GET", "/user/") as { user_id?: number };
    if (!data.user_id) throw new Error("/user/ returned no user_id");
    userId = data.user_id;
    console.error(`[yandex-webmaster-mcp] init OK: user_id=${userId}`);
  } catch (e) {
    console.error("[yandex-webmaster-mcp] init FAILED — startup aborted:", (e as Error).message);
    throw e;
  }
}

export function getUserId(): number {
  if (userId === null) throw new Error("client not initialized — call init() first");
  return userId;
}

type HostEntry = {
  host_id: string;        // e.g., "http:example.com:80"
  ascii_url: string;      // "http://example.com/"
  unicode_url: string;    // "http://example.com/" or "http://пример.рф/"
  scheme: "http" | "https";
};

let hostsCache: Map<string, HostEntry[]> | null = null;

function extractHostnameLiteral(url: string): string {
  // Pull hostname out of the raw string without WHATWG URL's automatic punycode conversion,
  // so we can index the cache by the unicode hostname Yandex returned us.
  const m = url.match(/^https?:\/\/([^\/:?#]+)/i);
  return (m ? m[1] : url).toLowerCase();
}

function normalizeHostKey(input: string): { key: string; scheme: "http" | "https" | null } {
  let s = input.trim().toLowerCase();
  let scheme: "http" | "https" | null = null;
  const schemeMatch = s.match(/^(https?):\/\//);
  if (schemeMatch) {
    scheme = schemeMatch[1] as "http" | "https";
    s = s.slice(schemeMatch[0].length);
  }
  s = s.replace(/\/$/, "");
  // also strip :port if present (the cache key is just hostname)
  s = s.replace(/:\d+$/, "");
  return { key: s, scheme };
}

export async function loadHosts(): Promise<void> {
  const uid = getUserId();
  const data = await rawCall("GET", `/user/${uid}/hosts/`) as { hosts: Array<{ host_id: string; ascii_host_url: string; unicode_host_url: string }> };
  const map = new Map<string, HostEntry[]>();
  for (const h of data.hosts) {
    const u = new URL(h.ascii_host_url);
    const scheme = u.protocol.replace(":", "") as "http" | "https";
    const entry: HostEntry = { host_id: h.host_id, ascii_url: h.ascii_host_url, unicode_url: h.unicode_host_url, scheme };
    const asciiKey = extractHostnameLiteral(h.ascii_host_url);
    const unicodeKey = extractHostnameLiteral(h.unicode_host_url);
    for (const k of new Set([asciiKey, unicodeKey])) {
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(entry);
    }
  }
  hostsCache = map;
}

export async function resolveHost(input: string): Promise<string> {
  if (!hostsCache) await loadHosts();
  const { key, scheme } = normalizeHostKey(input);
  const candidates = hostsCache!.get(key);
  if (!candidates || candidates.length === 0) {
    throw new Error(`Host "${input}" not registered. Call get_hosts to see available hosts.`);
  }
  if (scheme) {
    const match = candidates.find((c) => c.scheme === scheme);
    if (!match) throw new Error(`Host "${input}" found but not with scheme ${scheme}. Variants: ${candidates.map((c) => c.host_id).join(", ")}`);
    return match.host_id;
  }
  if (candidates.length === 1) return candidates[0].host_id;
  throw new Error(`Multiple variants for "${input}": ${candidates.map((c) => c.host_id).join(", ")}. Pass scheme prefix (https://... or http://...) to disambiguate.`);
}

export function clearHostsCache(): void {
  hostsCache = null;
}

export type EndpointDef = {
  name: string;
  description: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;                       // may contain {user_id}, {host_id}, and other {param} placeholders
  inputSchema: z.ZodObject<any>;
  query?: string[];                   // input fields routed to query string
  body?: string[];                    // input fields routed to JSON body
  pathParams?: string[];              // input fields routed to path interpolation (besides host)
  local?: (params: Record<string, unknown>) => Promise<unknown>;  // for non-API tools like refresh_hosts
};

const MUTATING_METHODS = new Set(["POST", "PATCH", "DELETE"]);

export async function callEndpoint(ep: EndpointDef, raw: Record<string, unknown>): Promise<unknown> {
  if (ep.local) return ep.local(raw);

  const parsed = ep.inputSchema.parse(raw);

  // Resolve host → host_id if needed
  let hostId: string | null = null;
  if (ep.path.includes("{host_id}")) {
    if (!parsed.host) throw new Error(`endpoint ${ep.name} requires "host" input`);
    hostId = await resolveHost(String(parsed.host));
    if (!hostId) throw new Error("internal: resolveHost returned null");
  }

  // Interpolate path placeholders
  let url = ep.path
    .replaceAll("{user_id}", String(getUserId()))
    .replaceAll("{host_id}", hostId!);

  // Other path params (reject traversal/separators so a crafted sitemap_id can't escape the path)
  for (const k of ep.pathParams ?? []) {
    const v = String(parsed[k] ?? "");
    if (/[\/?#]|\.\./.test(v)) throw new Error(`pathParam ${k} has illegal characters`);
    url = url.replaceAll(`{${k}}`, v);
  }

  // Split params into query/body
  const query: Record<string, string> = {};
  for (const k of ep.query ?? []) {
    if (parsed[k] !== undefined && parsed[k] !== null) query[k] = String(parsed[k]);
  }
  let body: Record<string, unknown> | undefined;
  if (ep.body && ep.body.length > 0) {
    body = {};
    for (const k of ep.body) {
      if (parsed[k] !== undefined) body[k] = parsed[k];
    }
  }

  // Confirm-gate for mutating writes — runs AFTER interpolation so the preview shows the actual URL.
  if (MUTATING_METHODS.has(ep.method) && parsed.confirm !== true) {
    return {
      dry_run: true,
      would_call: `${ep.method} ${url}`,
      params: parsed,
      body,
      query,
      note: "Pass confirm:true to execute.",
    };
  }

  return rawCall(ep.method, url, query, body);
}
