#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WarpClient } from "./client.js";
import { registerTools } from "./tools.js";
import { QUOTE_CARD_RESOURCE_URI, QUOTE_CARD_MCP_RESOURCE_URI, MCP_APP_MIME_TYPE, quoteCardTemplate, quoteCardMcpTemplate, } from "./widgets/quote-card.js";
// Node 20+ is required for native fetch and the MCP SDK. npx -y ignores the
// "engines" field, so a user on an older Node crashes with a cryptic
// "fetch is not defined". This guard converts that into an actionable message.
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 20) {
    console.error(`warp-agent-mcp requires Node.js 20 or later. Detected: ${process.versions.node}. ` +
        `Install Node 20+ from https://nodejs.org, or run: nvm install 20 && nvm use 20`);
    process.exit(1);
}
// Use WARP_API_URL env var if set (useful for staging), otherwise default to
// the warp-site proxy. The proxy at /api/v1/warp/* accepts wak_live_* and
// wak_test_* tokens via `Authorization: Bearer …`; the direct gateway at
// gw.wearewarp.com only accepts raw customer.wearewarp.com keys, which is why
// 0.5.62 and earlier returned "Invalid authorization" for users who signed
// up via `warp-agent signup`.
const WARP_API_URL = process.env.WARP_API_URL ?? "https://www.wearewarp.com/api/v1/warp";
// Read API key: env var first, then ~/.warp/config.json (set by warp-agent login)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
function sanitizeKey(key, raw = false) {
    if (raw)
        return key.trim();
    // Claude Desktop URL-decodes env vars — + becomes space. Re-encode spaces back to +
    return key.trim().replace(/ /g, "+");
}
function loadApiKey() {
    // ~/.warp/config.json takes priority — written by `warp-agent login` / `warp-agent signup`.
    // This ensures a CLI login always wins over a stale WARP_API_KEY env var set in
    // Claude Desktop config (otherwise env var would override the logged-in user's key).
    const homeDir = homedir();
    const candidates = [homeDir];
    // NOTE: we intentionally do NOT scan /Users/* — that would leak
    // other users' keys on shared machines (e.g. macOS with multiple accounts).
    // Deduplicate
    const seen = new Set();
    const unique = candidates.filter(d => d && !seen.has(d) && seen.add(d));
    for (const dir of unique) {
        try {
            const configPath = join(dir, ".warp", "config.json");
            const config = JSON.parse(readFileSync(configPath, "utf8"));
            if (config.api_key && config.api_key.length > 10) {
                return sanitizeKey(config.api_key);
            }
        }
        catch {
            // try next
        }
    }
    // Fallback: WARP_API_KEY env var (only used if no CLI login found on disk)
    if (process.env.WARP_API_KEY) {
        const raw = process.env.WARP_RAW_KEY === "1";
        const k = sanitizeKey(process.env.WARP_API_KEY, raw);
        if (k.length > 10)
            return k;
    }
    return undefined;
}
const WARP_API_KEY = loadApiKey();
// Read customer email from config for analytics
function loadCustomerEmail() {
    const homeDir = homedir();
    const candidates = [homeDir, ...(process.env.USER ? [`/Users/${process.env.USER}`] : [])];
    for (const dir of candidates) {
        try {
            const config = JSON.parse(readFileSync(join(dir, ".warp", "config.json"), "utf8"));
            if (config.email)
                return config.email;
        }
        catch { }
    }
    return undefined;
}
// Export for use in analytics module
export const LOADED_CUSTOMER_EMAIL = loadCustomerEmail();
// Debug: log key status to stderr (visible in Claude Desktop logs)
if (WARP_API_KEY) {
    console.error(`[warp-mcp] API key loaded (${WARP_API_KEY.length} chars, starts: ${WARP_API_KEY.slice(0, 4)})`);
}
else {
    console.error(`[warp-mcp] NO API KEY FOUND. HOME=${process.env.HOME} USER=${process.env.USER}`);
    // List what we tried
    const tried = [
        process.env.WARP_API_KEY ? `WARP_API_KEY env (${process.env.WARP_API_KEY.length} chars)` : "WARP_API_KEY env (not set)",
        `HOME=${process.env.HOME}`,
        `USER=${process.env.USER}`,
    ];
    console.error(`[warp-mcp] Tried: ${tried.join(", ")}`);
}
const server = new McpServer({
    name: "warp-agent-mcp",
    version: "0.1.0",
});
// Pass loadApiKey as a getter so every tool call re-reads from disk.
// This means CLI login/signup takes effect immediately without MCP restart.
const client = new WarpClient(WARP_API_URL, loadApiKey);
registerTools(server, client, loadApiKey);
// Inline quote-card UI resources, one per host UI protocol. ChatGPT's Apps SDK
// fetches the text/html resource and binds structuredContent via window.openai.
// Claude (MCP Apps / SEP-1865) fetches the text/html;profile=mcp-app resource and
// delivers the result over the postMessage bridge. Clients without UI ignore both.
server.registerResource("warp-quote-card", QUOTE_CARD_RESOURCE_URI, {
    description: "Inline quote card shown after warp_van_quote / warp_box_truck_quote / warp_ftl_quote / warp_ltl_quote. Renders rate, lane, transit, expiration countdown, and a Book CTA.",
    mimeType: "text/html",
}, async () => ({
    contents: [{ uri: QUOTE_CARD_RESOURCE_URI, mimeType: "text/html", text: quoteCardTemplate() }],
}));
// Claude / MCP Apps variant. Same card, but the inlined client speaks the MCP
// Apps postMessage bridge and the mimeType carries the mcp-app profile so Claude
// renders it as an interactive widget.
server.registerResource("warp-quote-card-mcp", QUOTE_CARD_MCP_RESOURCE_URI, {
    description: "Inline quote card (MCP Apps) shown after warp_van_quote / warp_box_truck_quote / warp_ftl_quote / warp_ltl_quote. Renders rate, lane, transit, expiration, and a Book CTA.",
    mimeType: MCP_APP_MIME_TYPE,
}, async () => ({
    contents: [{ uri: QUOTE_CARD_MCP_RESOURCE_URI, mimeType: MCP_APP_MIME_TYPE, text: quoteCardMcpTemplate() }],
}));
const transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map