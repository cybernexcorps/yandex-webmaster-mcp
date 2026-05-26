// src/smoke-test.ts
import { ZodError } from "zod";
import { callEndpoint, init, resolveHost } from "./client.js";
import { endpoints } from "./endpoints.js";

const DEFAULT_HOST = process.env.SMOKE_HOST ?? "example.com";

// Per-tool sample args for tools that need more than just `host`.
// Mutating tools use these to exercise the dry-run gate (omit confirm).
// Read-only tools requiring a sitemap_id are not auto-discovered — they SKIP via ZodError.
const SAMPLE_ARGS: Record<string, Record<string, unknown>> = {
  add_host: { host_url: `https://${DEFAULT_HOST}/` },
  add_user_sitemap: { host: DEFAULT_HOST, url: `https://${DEFAULT_HOST}/sitemap.xml` },
  request_recrawl: { host: DEFAULT_HOST, url: `https://${DEFAULT_HOST}/` },
  get_important_url_history: { host: DEFAULT_HOST, url: `http://${DEFAULT_HOST}/` },
};

function argsFor(epName: string): Record<string, unknown> {
  if (epName === "get_hosts" || epName === "refresh_hosts") return {};
  return SAMPLE_ARGS[epName] ?? { host: DEFAULT_HOST };
}

type Result = { name: string; status: "PASS" | "FAIL" | "DRY" | "SKIP"; ms: number; error?: string };

async function main() {
  // Optional: verify INVALID_OAUTH_TOKEN hint without needing a real account.
  if (process.env.SMOKE_BAD_TOKEN === "1") {
    const realToken = process.env.YANDEX_WEBMASTER_TOKEN;
    process.env.YANDEX_WEBMASTER_TOKEN = "definitely-not-valid";
    try {
      await init();
      console.error("FAIL: init succeeded with bad token");
      process.exit(1);
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("OAuth")) {
        console.error(`FAIL: error hint missing 'OAuth' guidance: ${msg}`);
        process.exit(1);
      }
      console.log(`PASS: bad-token error includes OAuth hint`);
    }
    if (realToken !== undefined) process.env.YANDEX_WEBMASTER_TOKEN = realToken;
  }

  await init();

  // Optional IDN / Unicode-host resolveHost coverage.
  // Opt-in because it depends on a specific host registered in YOUR Yandex account.
  // Set SMOKE_IDN_HOST to a Unicode host you own (e.g. пример.рф); optionally set
  // SMOKE_IDN_PUNYCODE to a substring the resolved host_id must contain (e.g. xn--).
  const idnHost = process.env.SMOKE_IDN_HOST;
  if (idnHost) {
    console.log("\n=== resolveHost IDN coverage ===");
    const resolved = await resolveHost(idnHost).catch((e) => `THREW: ${(e as Error).message}`);
    console.log(`  Unicode ${idnHost} → ${resolved}`);
    if (resolved.startsWith("THREW:")) throw new Error(`IDN lookup failed for ${idnHost}: ${resolved}`);
    const expectedSubstr = process.env.SMOKE_IDN_PUNYCODE;
    if (expectedSubstr && !resolved.includes(expectedSubstr)) {
      throw new Error(`IDN host resolved to "${resolved}", expected to contain "${expectedSubstr}"`);
    }
    const bogus = await resolveHost("nonexistent.example").catch((e) => `THREW: ${(e as Error).message}`);
    console.log(`  Bogus nonexistent.example → ${bogus}`);
    if (!bogus.startsWith("THREW:")) throw new Error("Bogus host should have thrown");
    console.log("  PASS");
  } else {
    console.log("\n=== resolveHost IDN coverage: SKIPPED (set SMOKE_IDN_HOST to enable) ===");
  }

  const results: Result[] = [];
  for (const ep of endpoints) {
    const t0 = Date.now();
    const isMut = ["POST", "PATCH", "DELETE"].includes(ep.method);
    try {
      const out = await callEndpoint(ep, argsFor(ep.name));
      const ms = Date.now() - t0;
      if (isMut) {
        const o = out as { dry_run?: boolean; would_call?: string; params?: unknown; note?: string };
        const ok = o.dry_run === true
          && typeof o.would_call === "string"
          && o.would_call.length > 0
          && o.params !== undefined
          && typeof o.note === "string";
        results.push({ name: ep.name, status: ok ? "DRY" : "FAIL", ms, error: ok ? undefined : "dry_run shape invalid (missing dry_run/would_call/params/note)" });
      } else {
        results.push({ name: ep.name, status: "PASS", ms });
      }
    } catch (e: unknown) {
      const ms = Date.now() - t0;
      if (e instanceof ZodError) {
        results.push({ name: ep.name, status: "SKIP", ms, error: "needs args: " + e.issues.map((i) => i.path.join(".")).join(", ") });
      } else {
        results.push({ name: ep.name, status: "FAIL", ms, error: (e as Error).message });
      }
    }
  }
  console.table(results);
  const pass = results.filter((r) => r.status === "PASS").length;
  const dry = results.filter((r) => r.status === "DRY").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n${results.length} tools  |  ${pass} pass  |  ${dry} dry  |  ${skip} skip  |  ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main();
