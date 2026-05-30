// MCP Apps client for the Warp batch-quote card (Claude path). Same bridge
// pattern as quote-card-client.ts / bookings-card-client.ts — connect via the
// official App class, paint via the shared window.__warpRenderBatchQuote
// (defined inline in the HTML).
//
// esbuild bundles this into a self-contained IIFE that batch-quote-card.ts
// inlines into the mcp-app resource variant.
import { App } from "@modelcontextprotocol/ext-apps";
function paint(data) {
    if (data && typeof window.__warpRenderBatchQuote === "function") {
        window.__warpRenderBatchQuote(data);
    }
}
const app = new App({ name: "warp-batch-quote-card", version: "1.0.0" });
app.addEventListener("toolresult", (params) => {
    paint(params.structuredContent);
});
app.connect().catch((err) => {
    console.error("[warp-widget] MCP Apps connect failed", err);
});
//# sourceMappingURL=batch-quote-card-client.js.map