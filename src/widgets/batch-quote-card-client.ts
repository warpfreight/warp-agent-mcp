// MCP Apps client for the Warp batch-quote card (Claude path). Same bridge
// pattern as quote-card-client.ts / bookings-card-client.ts — connect via the
// official App class, paint via the shared window.__warpRenderBatchQuote
// (defined inline in the HTML).
//
// esbuild bundles this into a self-contained IIFE that batch-quote-card.ts
// inlines into the mcp-app resource variant.
import { App } from "@modelcontextprotocol/ext-apps";

declare global {
  interface Window {
    __warpRenderBatchQuote?: (data: unknown) => void;
  }
}

function paint(data: unknown): void {
  if (data && typeof window.__warpRenderBatchQuote === "function") {
    window.__warpRenderBatchQuote(data);
  }
}

const app = new App({ name: "warp-batch-quote-card", version: "1.0.0" });

app.addEventListener("toolresult", (params) => {
  paint((params as { structuredContent?: unknown }).structuredContent);
});

app.connect().catch((err) => {
  console.error("[warp-widget] MCP Apps connect failed", err);
});
