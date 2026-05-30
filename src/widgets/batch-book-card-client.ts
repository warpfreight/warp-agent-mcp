// MCP Apps client for the Warp batch-book card (Claude path). Same bridge
// pattern as batch-quote-card-client.ts — connect via the official App class,
// paint via the shared window.__warpRenderBatchBook (defined inline in HTML).
//
// esbuild bundles this into a self-contained IIFE that batch-book-card.ts
// inlines into the mcp-app resource variant.
import { App } from "@modelcontextprotocol/ext-apps";

declare global {
  interface Window {
    __warpRenderBatchBook?: (data: unknown) => void;
  }
}

function paint(data: unknown): void {
  if (data && typeof window.__warpRenderBatchBook === "function") {
    window.__warpRenderBatchBook(data);
  }
}

const app = new App({ name: "warp-batch-book-card", version: "1.0.0" });

app.addEventListener("toolresult", (params) => {
  paint((params as { structuredContent?: unknown }).structuredContent);
});

app.connect().catch((err) => {
  console.error("[warp-widget] MCP Apps connect failed", err);
});
