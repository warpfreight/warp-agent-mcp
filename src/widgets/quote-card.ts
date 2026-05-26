// Inline quote-card widget for Warp MCP tools — multi-carrier comparison.
//
// Mirrors the customer-portal "Available options for this shipment" view: a
// featured Warp "best option" card plus the marketplace carrier spread. For LTL
// the spread comes from /api/v1/ltl/market-options (client.ts); other modes show
// just the featured Warp option.
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
  // Show the cheapest few inline; the rest live in the portal (32+ rows is too
  // tall for a chat widget). The count pill still reflects the true total.
  const MAX_SHOWN = 10;
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
  };
}

const CARD_CSS = `
:root {
  --bg: #0B0E13;
  --surface: #11161E;
  --surface-2: #141A23;
  --line: rgba(255,255,255,0.07);
  --text: #EEF2F7;
  --muted: #93A0B2;
  --dim: #6B7787;
  --accent: #3EE07F;
  --accent-soft: rgba(62,224,127,0.12);
  --accent-line: rgba(62,224,127,0.35);
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  line-height: 1.4;
}
.warp-root { max-width: 860px; margin: 0 auto; padding: 20px 22px; }
.mono { font-family: "Fira Code", ui-monospace, "SF Mono", Menlo, monospace; }
.wh-sep { color: var(--dim); margin: 0 2px; }

/* lane header */
.wh-lane { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; color: var(--muted); font-size: 14px; margin-bottom: 14px; }
.wh-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent); display: inline-block; }
.wh-arrow { color: var(--dim); }
.wh-lane .z { color: var(--text); font-weight: 600; }

/* title + counts */
.wh-title { font-size: 21px; font-weight: 700; letter-spacing: -0.01em; display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.wh-pill { font-size: 11px; font-weight: 600; padding: 3px 9px; border-radius: 999px; letter-spacing: 0.01em; }
.wh-pill-warp { background: var(--accent-soft); color: var(--accent); }
.wh-pill-mkt { background: rgba(255,255,255,0.06); color: var(--muted); }
.wh-subtitle { color: var(--dim); font-size: 13px; margin-bottom: 16px; }

/* featured warp card */
.wf-card { position: relative; background: var(--surface); border: 1px solid var(--accent-line); border-radius: 16px; padding: 22px 24px; overflow: hidden; }
.wf-card::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: var(--accent); }
.wf-top { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.wf-best { color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.wf-rec { font-size: 11px; font-weight: 600; color: var(--accent); border: 1px solid var(--accent-line); background: var(--accent-soft); padding: 2px 9px; border-radius: 999px; }
.wf-body { display: flex; justify-content: space-between; align-items: flex-start; gap: 28px; flex-wrap: wrap; }
.wf-left { display: flex; gap: 16px; align-items: flex-start; flex: 1 1 320px; min-width: 280px; }
.wf-truck { flex: 0 0 auto; margin-top: 2px; }
.wf-name { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.wf-warp { color: var(--accent); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
.wf-desc { color: var(--muted); font-size: 13px; margin-top: 6px; max-width: 420px; }
.wf-tagline { color: var(--dim); font-style: italic; font-size: 12.5px; margin-top: 6px; }
.wf-meta { color: var(--muted); font-size: 13px; margin-top: 12px; }
.wf-right { flex: 0 0 auto; min-width: 232px; display: flex; flex-direction: column; align-items: stretch; text-align: right; }
.wf-pp-label { color: var(--dim); font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.wf-pp { font-size: 44px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.02; margin-top: 2px; }
.wf-pp .u { font-size: 14px; color: var(--muted); font-weight: 500; margin-left: 4px; }
.wf-total { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); font-size: 14px; }
.wf-total .l { color: var(--muted); }
.wf-total .v { font-weight: 700; font-size: 16px; }
.wf-otp { color: var(--accent); font-size: 12.5px; font-weight: 500; margin-top: 8px; text-align: left; }
.wf-cta { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 16px; padding: 14px 20px; background: var(--accent); color: #07140C; font-size: 15px; font-weight: 700; text-decoration: none; border-radius: 11px; letter-spacing: 0.01em; transition: opacity 0.12s ease; }
.wf-cta:hover { opacity: 0.92; }
.wf-note { color: var(--dim); font-size: 11.5px; text-align: center; margin-top: 10px; }

/* marketplace list */
.wm-head { color: var(--dim); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; margin: 22px 0 10px; }
.wm-list { display: flex; flex-direction: column; gap: 8px; }
.wm-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; text-decoration: none; color: inherit; transition: background 0.12s ease, border-color 0.12s ease; }
.wm-row:hover { background: var(--surface-2); border-color: rgba(255,255,255,0.14); }
.wm-name { font-size: 14px; font-weight: 600; color: var(--text); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wm-tag { font-size: 10px; font-weight: 600; color: var(--muted); background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 5px; letter-spacing: 0.03em; }
.wm-sub { color: var(--dim); font-size: 12.5px; margin-top: 5px; }
.wm-price { display: flex; align-items: center; gap: 16px; white-space: nowrap; }
.wm-price .p { font-size: 17px; font-weight: 700; }
.wm-select { color: var(--muted); font-size: 13px; }
.wm-row:hover .wm-select { color: var(--accent); }
.wm-foot { color: var(--dim); font-size: 11.5px; margin-top: 12px; text-align: center; }`;

const CARD_BODY = `<div class="warp-root" id="__warp_root"></div>`;

// Shared painter. Receives QuoteWidgetData and builds the comparison DOM. One
// definition; both the ChatGPT reader and the Claude App client call it.
const RENDER_FN_JS = `
window.__warpRenderCard = function(data) {
  var root = document.getElementById("__warp_root");
  if (!root || !data || !data.warp) return;
  var TRUCK = '<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#3EE07F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 4.5h12v9h-12z"/><path d="M13.5 8h3.8l3.2 3.1v2.4h-7z"/><circle cx="6" cy="16.5" r="1.7"/><circle cx="17" cy="16.5" r="1.7"/></svg>';
  var MODE_LABEL = { van: "Cargo Van", "box-truck": "Box Truck", ftl: "Full Truckload", ltl: "LTL" };
  var PORTAL_MODE = { van: "cargo_van", "box-truck": "box_truck_26", ftl: "truck_53", ltl: "shared_ltl" };
  var modeLabel = MODE_LABEL[data.mode] || "LTL";
  var w = data.warp;
  var mkt = Array.isArray(data.marketplace) ? data.marketplace : [];
  var mktTotal = data.marketplace_count || mkt.length;
  var pallets = data.pallets || 1;

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c];}); }
  function money(n){ return "$" + Math.round(Number(n)||0).toLocaleString("en-US"); }
  function fmtDate(s){ if(!s) return "--"; try{ var d=new Date(s+"T12:00:00Z"); return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:"UTC"});}catch(e){return s;} }
  function days(n){ n=Number(n)||0; return n + (n===1?" day":" days"); }

  // Deep-link to the portal (auto-fires the lane), used by the Warp CTA + rows.
  var params = new URLSearchParams();
  params.set("originZip", data.origin_zip); params.set("destinationZip", data.destination_zip);
  params.set("pd", data.pickup_date); params.set("pc", String(pallets));
  params.set("mp", PORTAL_MODE[data.mode] || "shared_ltl");
  params.set("utm_source","mcp"); params.set("utm_medium","inline-widget"); params.set("utm_campaign","quote-card");
  if (w.quote_id) params.set("warp_quote_id", w.quote_id);
  var bookHref = (data.booking_url && data.booking_url.indexOf("warp_quote_id") > -1)
    ? data.booking_url
    : "https://customer.wearewarp.com/public/freight-quote?" + params.toString();

  var isLtl = data.mode === "ltl";
  var bigVal = isLtl ? w.per_pallet : w.rate_usd;
  var bigLabel = isLtl ? "PER PALLET" : "ALL-IN";

  var h = "";
  // lane header
  h += '<div class="wh-lane"><span class="wh-dot"></span><span class="z mono">' + esc(data.origin_zip) + '</span> <span class="wh-arrow">&#8594;</span> <span class="z mono">' + esc(data.destination_zip) + '</span><span class="wh-sep">&#183;</span>' + fmtDate(data.pickup_date) + '<span class="wh-sep">&#183;</span>' + pallets + (pallets===1?" pallet":" pallets") + '</div>';
  // title + counts
  h += '<div class="wh-title">Available options for this shipment';
  h += ' <span class="wh-pill wh-pill-warp">&#8226; ' + (data.warp_count||1) + ' Warp</span>';
  if (mktTotal) h += '<span class="wh-pill wh-pill-mkt">' + mktTotal + ' Marketplace</span>';
  h += '</div>';
  h += '<div class="wh-subtitle">' + (mkt.length ? "All rates loaded. Select an option to continue." : "Warp-direct rate for this lane.") + '</div>';

  // featured Warp card
  h += '<div class="wf-card">';
  h += '<div class="wf-top"><span class="wf-best">&#8226; Best option for this shipment</span><span class="wf-rec">Recommended</span></div>';
  h += '<div class="wf-body">';
  h += '<div class="wf-left"><div class="wf-truck">' + TRUCK + '</div><div>';
  h += '<div class="wf-name">Warp ' + esc(modeLabel) + ' <span class="wf-warp">WARP</span></div>';
  h += '<div class="wf-desc">Warp-direct pricing, live tracking included &#183; multi-stop network</div>';
  h += '<div class="wf-tagline">Fewer terminal touches for smoother routing</div>';
  h += '<div class="wf-meta">&#128197; Pickup: ' + fmtDate(data.pickup_date) + '<span class="wh-sep">&#183;</span>&#128336; Transit: ' + days(w.transit_days) + '</div>';
  h += '</div></div>';
  h += '<div class="wf-right">';
  h += '<div class="wf-pp-label">' + bigLabel + '</div>';
  h += '<div class="wf-pp">' + money(bigVal) + (isLtl ? '' : '<span class="u">all-in</span>') + '</div>';
  if (isLtl) h += '<div class="wf-total"><span class="l">Total</span><span class="v">' + money(w.rate_usd) + '</span></div>';
  h += '<div class="wf-otp">Warp ' + esc(modeLabel) + ' &#183; ' + (w.on_time_pct||98.2) + '% on-time delivery</div>';
  h += '<a class="wf-cta" href="' + esc(bookHref) + '" target="_blank" rel="noopener">Continue with Warp ' + esc(modeLabel) + ' &#8594;</a>';
  h += '<div class="wf-note">' + (w.payment_ready ? "Card on file. " : "") + 'No commitment until confirmed.</div>';
  h += '</div></div></div>';

  // marketplace spread
  if (mkt.length) {
    h += '<div class="wm-head">Other ' + esc(modeLabel) + ' carriers</div><div class="wm-list">';
    mkt.forEach(function(o){
      h += '<a class="wm-row" href="' + esc(bookHref) + '" target="_blank" rel="noopener">';
      h += '<div><div class="wm-name">' + esc(o.carrier_name) + ' <span class="wm-tag">' + esc(modeLabel) + '</span></div>';
      h += '<div class="wm-sub">Transit: ' + days(o.transit_days) + '<span class="wh-sep">&#183;</span>Pickup: ' + esc(data.pickup_date) + '</div></div>';
      h += '<div class="wm-price"><span class="p">' + money(o.rate_usd) + '</span><span class="wm-select">Select</span></div>';
      h += '</a>';
    });
    var more = mktTotal - mkt.length;
    var anyBookable = mkt.some(function(o){ return o && o.bookable; });
    var footMsg = anyBookable
      ? "Ask me to book any of these carriers directly."
      : "Marketplace rates are indicative; booking opens Warp at customer.wearewarp.com.";
    h += '</div><div class="wm-foot">' + (more > 0 ? ("+" + more + " more carriers &#183; ") : "") + footMsg + '</div>';
  }

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
<title>Warp Quote</title>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap" />
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
