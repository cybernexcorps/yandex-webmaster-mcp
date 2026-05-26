#!/usr/bin/env node
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { callEndpoint, init } from "./client.js";
import { endpoints } from "./endpoints.js";

async function main() {
  await init();
  const server = new McpServer({ name: "yandex-webmaster-mcp", version: "1.0.0" });
  for (const ep of endpoints) {
    server.tool(
      ep.name,
      ep.description,
      ep.inputSchema.shape,
      async (params: Record<string, unknown>) => {
        try {
          const out = await callEndpoint(ep, params);
          return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
        } catch (e) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: (e as Error).message }],
          };
        }
      }
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[yandex-webmaster-mcp] ready: ${endpoints.length} tools registered`);
}

main().catch((e) => {
  console.error("[yandex-webmaster-mcp] fatal:", e);
  process.exit(1);
});
