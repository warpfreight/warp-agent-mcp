// MCP Apps client for the Warp quote card (Claude path).
//
// Claude (claude.ai + Desktop) implements the MCP Apps standard (SEP-1865): it
// fetches the UI resource, renders it in a sandboxed iframe, then delivers the
// tool result over a JSON-RPC/postMessage bridge (ui/notifications/tool-result)
// rather than the synchronous window.openai.toolOutput that ChatGPT uses. This
// entry runs that bridge via the official App class and hands the quote data to
// the shared window.__warpRenderCard(data) painter (defined inline in the HTML).
//
// esbuild bundles this to a self-contained IIFE string (scripts/build-widget.mjs)
// that gets inlined into the mcp-app resource variant — so the render logic stays
// shared and only the ~bridge ships here.
import { App } from "@modelcontextprotocol/ext-apps";

declare global {
  interface Window {
    __warpRenderCard?: (data: unknown) => void;
  }
}

function paint(data: unknown): void {
  if (data && typeof window.__warpRenderCard === "function") {
    window.__warpRenderCard(data);
  }
}

const app = new App({ name: "warp-quote-card", version: "1.0.0" });

// structuredContent carries the QuoteWidgetData the server attached to the result.
app.addEventListener("toolresult", (params) => {
  paint((params as { structuredContent?: unknown }).structuredContent);
});

app.connect().catch((err) => {
  // Not fatal: a non-MCP-Apps host just won't complete the handshake.
  console.error("[warp-widget] MCP Apps connect failed", err);
});
