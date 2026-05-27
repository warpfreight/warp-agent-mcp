// MCP Apps client for the Warp bookings/shipments card (Claude path).
//
// Same bridge as quote-card-client.ts: Claude renders the UI resource in a
// sandboxed iframe and delivers the tool result over the MCP Apps postMessage
// bridge (SEP-1865). This entry runs that bridge via the official App class and
// hands the bookings data to the shared window.__warpRenderBookings(data) painter
// (defined inline in the HTML).
//
// esbuild bundles this to a self-contained IIFE string (scripts/build-widget.mjs)
// that gets inlined into the mcp-app resource variant.
import { App } from "@modelcontextprotocol/ext-apps";
function paint(data) {
    if (data && typeof window.__warpRenderBookings === "function") {
        window.__warpRenderBookings(data);
    }
}
const app = new App({ name: "warp-bookings-card", version: "1.0.0" });
// structuredContent carries the BookingsWidgetData the server attached to the result.
app.addEventListener("toolresult", (params) => {
    paint(params.structuredContent);
});
// The Track button can't use a plain <a target="_blank"> — MCP Apps run in a
// sandboxed iframe that blocks top/popup navigation. Route external links through
// the host via the spec's ui/open-link request (App.openLink). Fall back to
// window.open only if the host can't fulfil it.
function openViaHost(url) {
    try {
        const p = app.openLink({ url });
        if (p && typeof p.then === "function") {
            p
                .then((r) => { if (r && r.isError)
                try {
                    window.open(url, "_blank", "noopener,noreferrer");
                }
                catch { /* noop */ } })
                .catch(() => { try {
                window.open(url, "_blank", "noopener,noreferrer");
            }
            catch { /* noop */ } });
        }
        return;
    }
    catch { /* fall through */ }
    try {
        window.open(url, "_blank", "noopener,noreferrer");
    }
    catch { /* noop */ }
}
window.__warpOpenLink = openViaHost;
app.connect().catch((err) => {
    console.error("[warp-widget] MCP Apps connect failed", err);
});
//# sourceMappingURL=bookings-card-client.js.map