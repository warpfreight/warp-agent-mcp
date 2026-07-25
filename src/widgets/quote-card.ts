// Inline quote-card widget for Warp MCP tools.
//
// A single contained card: Warp wordmark header → "Available options" + lane →
// a list of carriers (Warp's own rate featured at top, then the marketplace
// spread) → footer. For LTL the spread comes from /api/v1/ltl/market-options
// (client.ts); other modes show just the featured Warp option. Page background
// is transparent and the palette is theme-adaptive (prefers-color-scheme) so it
// blends natively into Claude — light or dark.
//
// Dual-platform — ONE painter (window.__warpRenderCard), two delivery paths:
//   • ChatGPT (Apps SDK): window.openai.toolOutput.structuredContent.
//     Resource: ui://warp/quote-card  (text/html)
//   • Claude (MCP Apps / SEP-1865): tool result over the postMessage bridge via
//     the bundled App client. Resource: ui://warp/quote-card.mcp (text/html;profile=mcp-app)
// Non-UI clients ignore both and fall back to the text JSON.
import { APP_CLIENT_BUNDLE } from "./quote-card-client-bundle.js";

export type QuoteMode = "van" | "box-truck" | "ftl" | "ltl";

export interface MarketplaceOption {
  carrier_name: string;
  rate_usd: number;
  per_pallet: number;
  transit_days: number;
  service_level?: string;
  // Present once warp-site exposes per-carrier booking: the bookable quote_id for
  // this carrier (pass to warp_book). Absent on keyless/display-only spreads.
  quote_id?: string;
  bookable?: boolean;
}

export interface QuoteWidgetData {
  type: "quote";
  mode: QuoteMode;
  origin_zip: string;
  destination_zip: string;
  pickup_date: string;
  pallets: number;
  expires_at: string;
  booking_url: string;
  warp: {
    quote_id: string;
    rate_usd: number;
    per_pallet: number;
    transit_days: number;
    delivery_date: string;
    vehicle_label: string;
    on_time_pct: number;
    payment_ready: boolean;
  };
  marketplace: MarketplaceOption[];
  warp_count: number;
  marketplace_count: number;
  // When true and `marketplace` is empty, the card renders shimmering skeleton
  // rows + a "finding other carrier rates…" footer — used by warp_ltl_quote
  // to signal that warp_ltl_market_options is the natural follow-up call.
  loading_market?: boolean;
}

export const QUOTE_CARD_RESOURCE_URI = "ui://warp/quote-card";
export const QUOTE_CARD_MCP_RESOURCE_URI = "ui://warp/quote-card.mcp";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

const MODE_LABELS: Record<QuoteMode, string> = {
  van: "Cargo Van",
  "box-truck": "26' Box Truck",
  ftl: "Full Truckload",
  ltl: "LTL",
};

export function toWidgetData(
  mode: QuoteMode,
  input: { origin_zip: string; destination_zip: string; pickup_date: string; pallets?: number },
  response: Record<string, unknown>,
): QuoteWidgetData | null {
  const quoteId = typeof response.quote_id === "string" ? response.quote_id : null;
  const rate = typeof response.price_usd === "number" ? response.price_usd : null;
  if (!quoteId || rate === null) return null;

  const pallets = input.pallets ?? 1;
  const service = (response.service ?? {}) as Record<string, unknown>;
  const vehicle = typeof service.vehicle === "string" ? service.vehicle : MODE_LABELS[mode];
  const transit = typeof response.transit_days === "number" ? response.transit_days : 0;
  const delivery = typeof response.delivery_date === "string" ? response.delivery_date : input.pickup_date;
  const expires = typeof response.expires_at === "string" ? response.expires_at : new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const rawMkt = Array.isArray(response.market_options) ? (response.market_options as Array<Record<string, unknown>>) : [];
  const marketplaceAll: MarketplaceOption[] = rawMkt
    .filter((o) => o && o.is_warp !== true && typeof o.price_usd === "number" && typeof o.carrier_name === "string")
    .map((o) => ({
      carrier_name: String(o.carrier_name),
      rate_usd: o.price_usd as number,
      per_pallet: (o.price_usd as number) / pallets,
      transit_days: typeof o.transit_days === "number" ? o.transit_days : transit,
      service_level: typeof o.service_level === "string" ? o.service_level : undefined,
      // Per-carrier bookable id (warp-site per-carrier booking) — lets warp_book this carrier.
      quote_id: typeof o.quote_id === "string" ? o.quote_id : undefined,
      bookable: o.bookable === true,
    }))
    .sort((a, b) => a.rate_usd - b.rate_usd);
  // Include all carriers — the card renders them in a fixed-height scroll area,
  // so the overall card stays compact while every option stays reachable.
  const MAX_SHOWN = 50;
  const marketplace = marketplaceAll.slice(0, MAX_SHOWN);

  return {
    type: "quote",
    mode,
    origin_zip: input.origin_zip,
    destination_zip: input.destination_zip,
    pickup_date: input.pickup_date,
    pallets,
    expires_at: expires,
    booking_url: typeof response.booking_url === "string" ? response.booking_url : "",
    warp: {
      quote_id: quoteId,
      rate_usd: rate,
      per_pallet: rate / pallets,
      transit_days: transit,
      delivery_date: delivery,
      vehicle_label: vehicle,
      on_time_pct: 98.2,
      payment_ready: response.payment_ready === true,
    },
    marketplace,
    warp_count: 1,
    marketplace_count: marketplaceAll.length,
    loading_market: mode === "ltl" && marketplaceAll.length === 0 && response.loading_market === true,
  };
}

// Contained, Instacart-style card. Transparent page; palette defaults to LIGHT
// and flips to dark only under prefers-color-scheme:dark — so it blends into
// Claude's surface either way (and never renders as a dark slab on light).
const CARD_CSS = `
:root {
  --card: #ffffff;
  --line: #eceae3;
  --line2: #f3f1ec;
  --text: #1c1b19;
  --muted: #6f7480;
  --dim: #9a9ea6;
  --accent: #16a34a;
  --accent-soft: rgba(74,222,128,0.16);
  --warp-tint: rgba(74,222,128,0.07);
  --icon-bg: #f1f0ec;
  --icon-text: #5b6068;
  --logo: #16a34a;
  --shadow: 0 1px 3px rgba(0,0,0,0.05);
}
@media (prefers-color-scheme: dark) {
  :root {
    --card: #1b1b1d;
    --line: #2f2f32;
    --line2: #262629;
    --text: #ececed;
    --muted: #9a9aa2;
    --dim: #71717a;
    --accent: #4ade80;
    --accent-soft: rgba(74,222,128,0.15);
    --warp-tint: rgba(74,222,128,0.055);
    --icon-bg: #27272a;
    --icon-text: #b6b6bd;
    --logo: #00FF33;
    --shadow: 0 1px 3px rgba(0,0,0,0.25);
  }
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: transparent;
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
}
.warp-root { max-width: 580px; margin: 0 auto; padding: 8px; }
.wcard { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow);
  animation: warpCardIn 0.42s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes warpCardIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes warpRowIn { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }

/* header */
.wh-head { display: flex; align-items: center; gap: 9px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.wh-logo { color: var(--logo); display: flex; align-items: center; }
.wh-logo svg { height: 17px; width: auto; display: block; }
.wh-ti { font-weight: 600; font-size: 13.5px; color: var(--text); }

/* section header */
.wh-sec { padding: 13px 16px 4px; }
.wh-sec .st { font-weight: 700; font-size: 14.5px; }
.wh-sec .ss { color: var(--muted); font-size: 12.5px; margin-top: 3px; }

/* rows */
.wm-list { padding: 6px 0 2px; }
/* Fixed-height scroll area for the marketplace carriers: the card stays small
   and clean; the user scrolls the list to see every carrier. Warp's row is
   pinned above this, always visible. */
.wm-scroll { max-height: 264px; overflow-y: auto; border-top: 1px solid var(--line2); -webkit-overflow-scrolling: touch; }
.wm-scroll::-webkit-scrollbar { width: 8px; }
.wm-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.wm-scroll::-webkit-scrollbar-track { background: transparent; }
.wm-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; }
.wm-row + .wm-row { border-top: 1px solid var(--line2); }
.wm-row.warp { background: var(--warp-tint); }
.wm-ic { width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 11.5px; background: var(--icon-bg); color: var(--icon-text); letter-spacing: 0.03em; }
.wm-ic.warpic { background: var(--accent-soft); color: var(--accent); }
.wm-mn { flex: 1 1 auto; min-width: 0; }
.wm-nm { font-weight: 650; font-size: 13.5px; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.wm-me { color: var(--muted); font-size: 12px; margin-top: 3px; }
.wm-pr { font-weight: 700; font-size: 15px; white-space: nowrap; text-align: right; }
.wm-pr small { display: block; color: var(--muted); font-weight: 500; font-size: 10.5px; margin-top: 1px; }
.wm-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); letter-spacing: 0.02em; }
.wm-more { padding: 9px 16px 4px; color: var(--muted); font-size: 12.5px; }
.wm-foot { padding: 11px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 12px; text-align: center; }
/* Skeleton-row block shown beneath the Warp featured row while the carrier
   spread (warp_ltl_market_options) is still fetching. Shimmering placeholders
   communicate "more is coming" without leaving an empty space. */
.wm-skel { padding: 4px 0 2px; border-top: 1px solid var(--line2); }
.wm-skel-row { display: flex; align-items: center; gap: 12px; padding: 11px 16px; }
.wm-skel-row + .wm-skel-row { border-top: 1px solid var(--line2); }
.wm-skel-ic, .wm-skel-line, .wm-skel-pr {
  background: linear-gradient(90deg, var(--line2) 0%, var(--line) 50%, var(--line2) 100%);
  background-size: 220% 100%;
  animation: warpShimmer 1.6s ease-in-out infinite;
  border-radius: 4px;
}
.wm-skel-ic { width: 36px; height: 36px; border-radius: 9px; flex: 0 0 auto; }
.wm-skel-body { flex: 1 1 auto; }
.wm-skel-line { height: 11px; margin-bottom: 6px; width: 60%; }
.wm-skel-line.b { width: 38%; height: 9px; margin-bottom: 0; }
.wm-skel-pr { width: 46px; height: 13px; }
.wm-skel-row:nth-child(2) .wm-skel-line { width: 52%; }
.wm-skel-row:nth-child(2) .wm-skel-line.b { width: 32%; }
.wm-skel-row:nth-child(3) .wm-skel-line { width: 68%; }
.wm-skel-row:nth-child(3) .wm-skel-line.b { width: 42%; }
@keyframes warpShimmer {
  0%   { background-position: 220% 0; }
  100% { background-position: -220% 0; }
}
.wm-loading-note {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 11px 16px 6px; color: var(--muted); font-size: 12px; font-weight: 500;
}
.wm-loading-dot {
  width: 6px; height: 6px; border-radius: 999px; background: var(--accent);
  animation: warpPulse 1.2s ease-in-out infinite;
}
@keyframes warpPulse {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50%      { opacity: 1.0;  transform: scale(1); }
}
/* Rows fade/slide in with a gentle stagger as the card opens. Warp's featured
   row leads; the marketplace rows follow. */
.wm-row { animation: warpRowIn 0.44s cubic-bezier(0.16,1,0.3,1) both; }
.wm-row.warp { animation-delay: 0.06s; }
.wm-scroll .wm-row:nth-child(1) { animation-delay: 0.10s; }
.wm-scroll .wm-row:nth-child(2) { animation-delay: 0.14s; }
.wm-scroll .wm-row:nth-child(3) { animation-delay: 0.18s; }
.wm-scroll .wm-row:nth-child(4) { animation-delay: 0.22s; }
.wm-scroll .wm-row:nth-child(5) { animation-delay: 0.26s; }
.wm-scroll .wm-row:nth-child(6) { animation-delay: 0.30s; }
.wm-scroll .wm-row:nth-child(n+7) { animation-delay: 0.34s; }
@media (prefers-reduced-motion: reduce) {
  .wcard, .wm-row, .wm-skel-ic, .wm-skel-line, .wm-skel-pr, .wm-loading-dot { animation: none !important; }
}`;

const CARD_BODY = `<div class="warp-root" id="__warp_root"></div>`;

// Shared painter. Receives QuoteWidgetData and builds the card DOM. One
// definition; both the ChatGPT reader and the Claude App client call it.
const RENDER_FN_JS = `
window.__warpRenderCard = function(data) {
  var root = document.getElementById("__warp_root");
  if (!root || !data || !data.warp) return;
  var LOGO = '<svg viewBox="0 0 660 186" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WARP"><path d="M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z" fill="currentColor"/><path d="M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z" fill="currentColor"/><path d="M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z" fill="currentColor"/><path d="M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z" fill="currentColor"/><path d="M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z" fill="currentColor"/><path d="M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z" fill="currentColor"/><path d="M292.04 76.1794H275.219V94.1557H292.04V76.1794Z" fill="currentColor"/><path d="M275.219 131.615H292.04V113.84H275.219V131.615Z" fill="currentColor"/></svg>';
  var TRUCK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 5h12v9h-12z"/><path d="M13.5 8.5h3.6l3.4 3v2.5h-7z"/><circle cx="6" cy="16.5" r="1.6"/><circle cx="17" cy="16.5" r="1.6"/></svg>';
  var MODE_LABEL = { van: "Cargo Van", "box-truck": "Box Truck", ftl: "Full Truckload", ltl: "LTL" };
  var modeLabel = MODE_LABEL[data.mode] || "LTL";
  var w = data.warp;
  var mkt = Array.isArray(data.marketplace) ? data.marketplace : [];
  var mktTotal = data.marketplace_count || mkt.length;
  var pallets = data.pallets || 1;
  var isLtl = data.mode === "ltl";

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c];}); }
  function money(n){ return "$" + Math.round(Number(n)||0).toLocaleString("en-US"); }
  function fmtDate(s){ if(!s) return "--"; try{ var d=new Date(s+"T12:00:00Z"); return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"});}catch(e){return s;} }
  function days(n){ n=Number(n)||0; return n + (n===1?" day":" days"); }
  function initials(s){ var t=String(s||"").replace(/[^A-Za-z]/g,""); return (t.slice(0,2)||"?").toUpperCase(); }

  var SEP = ' &#183; ';
  var h = '<div class="wcard">';

  // header — real Warp wordmark + "Freight"
  h += '<div class="wh-head"><span class="wh-logo">' + LOGO + '</span><span class="wh-ti">Freight</span></div>';

  // section header — "Available options" + the lane
  h += '<div class="wh-sec"><div class="st">Available options</div><div class="ss">' +
    esc(data.origin_zip) + ' &#8594; ' + esc(data.destination_zip) + SEP + fmtDate(data.pickup_date) +
    SEP + pallets + (pallets===1?" pallet":" pallets") + SEP + esc(modeLabel) + '</div></div>';

  // list — Warp featured row first
  h += '<div class="wm-list">';
  var warpPr = '<div class="wm-pr">' + money(w.rate_usd) +
    (isLtl ? '<small>' + money(w.per_pallet) + ' / pallet</small>' : '<small>all-in</small>') + '</div>';
  h += '<div class="wm-row warp"><div class="wm-ic warpic">' + TRUCK + '</div>' +
    '<div class="wm-mn"><div class="wm-nm">Warp ' + esc(modeLabel) + ' <span class="wm-badge">Recommended</span></div>' +
    '<div class="wm-me">' + days(w.transit_days) + SEP + (w.on_time_pct||98.2) + '% on-time' + SEP + 'all-inclusive</div></div>' +
    warpPr + '</div>';

  // marketplace rows — in a fixed-height scroll area, so the card stays compact
  // while every carrier is reachable (no "+N more" dead-end). When the spread
  // is still loading (warp_ltl_quote fired, warp_ltl_market_options pending),
  // render shimmering skeleton rows + a "finding other carriers" footer so the
  // card communicates that more is coming.
  if (mkt.length) {
    h += '<div class="wm-scroll">';
    mkt.forEach(function(o){
      h += '<div class="wm-row"><div class="wm-ic">' + esc(initials(o.carrier_name)) + '</div>' +
        '<div class="wm-mn"><div class="wm-nm">' + esc(o.carrier_name) + '</div>' +
        '<div class="wm-me">' + days(o.transit_days) + SEP + esc(modeLabel) + '</div></div>' +
        '<div class="wm-pr">' + money(o.rate_usd) + '</div></div>';
    });
    h += '</div>';
  } else if (data.loading_market) {
    h += '<div class="wm-skel">';
    for (var s = 0; s < 3; s++) {
      h += '<div class="wm-skel-row"><div class="wm-skel-ic"></div>' +
        '<div class="wm-skel-body"><div class="wm-skel-line"></div><div class="wm-skel-line b"></div></div>' +
        '<div class="wm-skel-pr"></div></div>';
    }
    h += '<div class="wm-loading-note"><span class="wm-loading-dot"></span>Finding 30+ more carrier rates &#183; ~15s</div>';
    h += '</div>';
  }
  h += '</div>';

  // footer
  var anyBookable = mkt.some(function(o){ return o && o.bookable; });
  var foot;
  if (data.loading_market && !mkt.length) {
    foot = "Warp rate ready &#183; comparing 30+ carriers&hellip;";
  } else if (mkt.length) {
    foot = anyBookable
      ? "All-inclusive pricing &#183; ask me to book any carrier directly"
      : "All-inclusive pricing &#183; sign in to book a specific carrier";
  } else {
    foot = w.payment_ready
      ? "All-inclusive pricing &#183; ask me to book it"
      : "All-inclusive pricing &#183; add a card to book";
  }
  h += '<div class="wm-foot">' + foot + '</div>';

  h += '</div>';
  root.innerHTML = h;
};`;

const OPENAI_CLIENT_JS = `
(function() {
  function readData() {
    try {
      var o = (typeof window !== "undefined" && window.openai && window.openai.toolOutput && window.openai.toolOutput.structuredContent) || null;
      if (o) return o;
    } catch (e) {}
    try {
      var inline = document.getElementById("__warp_data");
      if (inline && inline.textContent) return JSON.parse(inline.textContent);
    } catch (e) {}
    return null;
  }
  var data = readData();
  if (data) window.__warpRenderCard(data);
})();`;

function buildHtml(opts: { clientScript: string; dataScript?: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Warp Quote</title>
<style>${CARD_CSS}</style>
</head>
<body>
${CARD_BODY}

${opts.dataScript ?? ""}

<script>${RENDER_FN_JS}</script>
<script>${opts.clientScript}</script>
</body>
</html>`;
}

// ChatGPT path, data embedded inline (used in tool-result content for embedded hosts).
export function renderQuoteCard(data: QuoteWidgetData): string {
  const jsonScript = `<script id="__warp_data" type="application/json">${escapeJsonForScript(
    JSON.stringify(data),
  )}</script>`;
  return buildHtml({ clientScript: OPENAI_CLIENT_JS, dataScript: jsonScript });
}

// ChatGPT Apps SDK resource (bare template; structuredContent bound at render).
export function quoteCardTemplate(): string {
  return buildHtml({ clientScript: OPENAI_CLIENT_JS });
}

// Claude / MCP Apps resource (bare template; data arrives via the postMessage
// bridge in the bundled App client, which calls window.__warpRenderCard).
export function quoteCardMcpTemplate(): string {
  return buildHtml({ clientScript: APP_CLIENT_BUNDLE });
}

// JSON-LD safety: any "</script>" or "<script" inside the JSON payload would
// terminate the surrounding <script> tag. Escape before embedding JSON in a tag.
function escapeJsonForScript(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script").replace(/<script/gi, "<\\script");
}
