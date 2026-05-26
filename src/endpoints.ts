// src/endpoints.ts
import { z } from "zod";
import { clearHostsCache, type EndpointDef } from "./client.js";

const hostInput = z.object({ host: z.string().describe("Friendly hostname like 'example.com' or 'пример.рф'. Prefix with scheme (https://...) to disambiguate when both http and https variants are registered.") });
const confirmField = { confirm: z.boolean().optional().describe("Required true to execute mutating call; otherwise returns dry-run preview.") };

export const endpoints: EndpointDef[] = [
  // ── Hosts ──────────────────────────────────────────────────────────
  {
    name: "get_hosts",
    description: "List all hosts registered in Yandex Webmaster with verification status.",
    method: "GET",
    path: "/user/{user_id}/hosts/",
    inputSchema: z.object({}),
  },
  {
    name: "get_host_info",
    description: "Host info: verification, mirror status, regions, etc.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/",
    inputSchema: hostInput,
  },
  {
    name: "get_host_summary",
    description: "Host summary: SQI, pages-in-search count, excluded count, top-level problem counts.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/summary/",
    inputSchema: hostInput,
  },
  {
    name: "add_host",
    description: "[mutating] Register a new host in Yandex Webmaster.",
    method: "POST",
    path: "/user/{user_id}/hosts/",
    inputSchema: z.object({
      host_url: z.string().url().describe("Full URL of the host to add, e.g. https://example.com/"),
      ...confirmField,
    }),
    body: ["host_url"],
  },
  // ── Diagnostics ─────────────────────────────────────────────────────
  {
    name: "get_diagnostics",
    description: "Full list of site problems and recommendations with severity and state (PRESENT/ABSENT/UNDEFINED).",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/diagnostics/",
    inputSchema: hostInput,
  },
  // ── Indexing & SQI ──────────────────────────────────────────────────
  {
    name: "get_indexing_history",
    description: "Time series of pages-in-search count and excluded pages count.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/indexing/history/",
    inputSchema: hostInput.extend({
      date_from: z.string().optional().describe("YYYY-MM-DD"),
      date_to: z.string().optional().describe("YYYY-MM-DD"),
    }),
    query: ["date_from", "date_to"],
  },
  {
    name: "get_indexing_samples",
    description: "Sample URLs from the indexing pipeline with their current state.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/indexing/samples/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_insearch_samples",
    description: "Sample URLs currently in Yandex search index.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-urls/in-search/samples/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_insearch_history",
    description: "Time series of in-search URL counts.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-urls/in-search/history/",
    inputSchema: hostInput,
  },
  {
    name: "get_sqi_history",
    description: "Time series of Site Quality Index (SQI / ИКС).",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/sqi-history/",
    inputSchema: hostInput,
  },
  // ── Search-URL events ───────────────────────────────────────────────
  {
    name: "get_search_url_events_samples",
    description: "Sample URLs with recent search-index events (added, removed, status changes).",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-urls/events/samples/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_search_url_events_history",
    description: "Time series of search-URL event counts.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-urls/events/history/",
    inputSchema: hostInput,
  },
  // ── Sitemaps ────────────────────────────────────────────────────────
  {
    name: "get_sitemaps",
    description: "List sitemaps registered for the host (auto-discovered + user-added).",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/sitemaps/",
    inputSchema: hostInput,
  },
  {
    name: "get_sitemap_info",
    description: "Single sitemap details: URL, last access date, error count, URL count.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/sitemaps/{sitemap_id}/",
    inputSchema: hostInput.extend({
      sitemap_id: z.string().uuid().describe("Sitemap UUID from get_sitemaps."),
    }),
    pathParams: ["sitemap_id"],
  },
  {
    name: "get_sitemap_urls",
    description: "URLs included in a sitemap with their indexing status.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/sitemaps/{sitemap_id}/urls/",
    inputSchema: hostInput.extend({
      sitemap_id: z.string().uuid(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    pathParams: ["sitemap_id"],
    query: ["limit", "offset"],
  },
  {
    name: "add_user_sitemap",
    description: "[mutating] Register a sitemap URL (user-added, in addition to ones auto-discovered from robots.txt).",
    method: "POST",
    path: "/user/{user_id}/hosts/{host_id}/user-added-sitemaps/",
    inputSchema: hostInput.extend({
      url: z.string().url().describe("Full sitemap URL, e.g., https://example.com/sitemap.xml"),
      ...confirmField,
    }),
    body: ["url"],
  },
  {
    name: "delete_user_sitemap",
    description: "[mutating] Remove a previously user-added sitemap.",
    method: "DELETE",
    path: "/user/{user_id}/hosts/{host_id}/user-added-sitemaps/{sitemap_id}/",
    inputSchema: hostInput.extend({
      sitemap_id: z.string().uuid(),
      ...confirmField,
    }),
    pathParams: ["sitemap_id"],
  },
  // ── Important URLs ──────────────────────────────────────────────────
  {
    name: "get_important_urls",
    description: "Current set of URLs Yandex considers important for this host, with indexing state.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/important-urls/",
    inputSchema: hostInput,
  },
  {
    name: "get_important_url_history",
    description: "Per-URL indexing history for a specific page on the host. The page must be one of Yandex's tracked URLs for this host.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/important-urls/history/",
    inputSchema: hostInput.extend({
      url: z.string().url().describe("Specific URL to get indexing history for."),
    }),
    query: ["url"],
  },
  // ── Recrawl ─────────────────────────────────────────────────────────
  {
    name: "request_recrawl",
    description: "[mutating] Push a URL into Yandex's recrawl queue. The big 'force reindex' lever.",
    method: "POST",
    path: "/user/{user_id}/hosts/{host_id}/recrawl/queue/",
    inputSchema: hostInput.extend({
      url: z.string().url(),
      ...confirmField,
    }),
    body: ["url"],
  },
  {
    name: "get_recrawl_queue",
    description: "List of submitted recrawl tasks and their status.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/recrawl/queue/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_recrawl_quota",
    description: "Daily recrawl quota remaining for this host.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/recrawl/quota/",
    inputSchema: hostInput,
  },
  // ── Search queries ──────────────────────────────────────────────────
  {
    name: "get_popular_queries",
    description: "Top search queries by impressions: query text, impressions, clicks, CTR, avg position.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-queries/popular/",
    inputSchema: hostInput.extend({
      order_by: z.enum(["TOTAL_SHOWS", "TOTAL_CLICKS"]).default("TOTAL_SHOWS"),
      query_indicator: z.enum(["TOTAL_SHOWS", "TOTAL_CLICKS", "AVG_SHOW_POSITION", "AVG_CLICK_POSITION"]).default("TOTAL_SHOWS"),
      device_type_indicator: z.enum(["ALL", "DESKTOP", "MOBILE_AND_TABLET", "MOBILE", "TABLET"]).optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    }),
    query: ["order_by", "query_indicator", "device_type_indicator", "date_from", "date_to"],
  },
  {
    name: "get_queries_history",
    description: "Time series of total queries metrics.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/search-queries/all/history/",
    inputSchema: hostInput.extend({
      date_from: z.string().describe("YYYY-MM-DD").default(() => new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)),
      date_to: z.string().describe("YYYY-MM-DD").default(() => new Date().toISOString().slice(0, 10)),
    }),
    query: ["date_from", "date_to"],
  },
  // ── Links ───────────────────────────────────────────────────────────
  {
    name: "get_external_links_samples",
    description: "Sample external (incoming) links pointing at this site.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/links/external/samples/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_external_links_history",
    description: "Time series of external (backlink) counts.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/links/external/history/",
    inputSchema: hostInput,
  },
  {
    name: "get_internal_broken_samples",
    description: "Sample broken internal links inside the site.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/links/internal/broken/samples/",
    inputSchema: hostInput.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }),
    query: ["limit", "offset"],
  },
  {
    name: "get_internal_broken_history",
    description: "Time series of broken internal link counts.",
    method: "GET",
    path: "/user/{user_id}/hosts/{host_id}/links/internal/broken/history/",
    inputSchema: hostInput,
  },
  // ── Local-only ──────────────────────────────────────────────────────
  {
    name: "refresh_hosts",
    description: "Bust the in-process hosts cache. Call after adding/removing a host via the Yandex UI. No API call made.",
    method: "GET",
    path: "",
    inputSchema: z.object({}),
    local: async () => {
      clearHostsCache();
      return { refreshed: true, note: "Hosts cache cleared; next host-resolving call will reload from API." };
    },
  },
];
