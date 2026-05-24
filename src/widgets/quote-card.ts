// Inline quote-card widget for Warp MCP tools.
//
// Renders a Warp-branded card showing rate, lane, transit, expiration, and a
// "Book now" CTA that deep-links to the customer portal with all params
// pre-filled so the portal auto-fires the quote. Used by the four quote tools
// (warp_van_quote, warp_box_truck_quote, warp_ftl_quote, warp_ltl_quote).
//
// Dual-platform: ChatGPT Apps SDK reads window.openai.toolOutput.structuredContent,
// Claude reads inline JSON from <script id="__warp_data">. One template serves both.

export type QuoteMode = "van" | "box-truck" | "ftl" | "ltl";

export interface QuoteWidgetData {
  quote_id: string;
  mode: QuoteMode;
  rate_usd: number;
  origin_zip: string;
  destination_zip: string;
  pallets: number;
  pickup_date: string;
  delivery_date: string;
  transit_days: number;
  expires_at: string;
  vehicle_label: string;
  payment_ready: boolean;
}

export const QUOTE_CARD_RESOURCE_URI = "ui://warp/quote-card";

const MODE_LABELS: Record<QuoteMode, string> = {
  van: "Cargo Van",
  "box-truck": "26' Box Truck",
  ftl: "Full Truckload",
  ltl: "LTL",
};

const PORTAL_MODE_PARAM: Record<QuoteMode, string> = {
  van: "cargo_van",
  "box-truck": "box_truck_26",
  ftl: "truck_53",
  ltl: "shared_ltl",
};

export function toWidgetData(
  mode: QuoteMode,
  input: {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number;
  },
  response: Record<string, unknown>,
): QuoteWidgetData | null {
  const quoteId = typeof response.quote_id === "string" ? response.quote_id : null;
  const rate = typeof response.price_usd === "number" ? response.price_usd : null;
  if (!quoteId || rate === null) return null;

  const service = (response.service ?? {}) as Record<string, unknown>;
  const vehicle = typeof service.vehicle === "string" ? service.vehicle : MODE_LABELS[mode];
  const transit = typeof response.transit_days === "number" ? response.transit_days : 0;
  const delivery = typeof response.delivery_date === "string" ? response.delivery_date : input.pickup_date;
  const expires = typeof response.expires_at === "string" ? response.expires_at : new Date(Date.now() + 15 * 60 * 1000).toISOString();

  return {
    quote_id: quoteId,
    mode,
    rate_usd: rate,
    origin_zip: input.origin_zip,
    destination_zip: input.destination_zip,
    pallets: input.pallets ?? 1,
    pickup_date: input.pickup_date,
    delivery_date: delivery,
    transit_days: transit,
    expires_at: expires,
    vehicle_label: vehicle,
    payment_ready: response.payment_ready === true,
  };
}

// Inline HTML template. CSS + JS live inside the document so the widget renders
// in any sandboxed iframe with no external dependencies (other than the Google
// Fonts stylesheet which gracefully degrades to system fonts if blocked).
function buildHtml(jsonScriptTag: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Warp Quote</title>
<link rel="preconnect" href="https://fonts.googleapis.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" />
<style>
:root {
  --warp-bg: #141C2B;
  --warp-surface: #1A2332;
  --warp-border: rgba(255,255,255,0.08);
  --warp-text: #E8EEF7;
  --warp-text-dim: #8895AB;
  --warp-accent: #4ADE80;
  --warp-accent-dim: rgba(74,222,128,0.12);
  --warp-radius: 12px;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: transparent;
  font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: var(--warp-text);
}
.warp-card {
  background: var(--warp-surface);
  border: 1px solid var(--warp-border);
  border-radius: var(--warp-radius);
  padding: 20px;
  max-width: 480px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.warp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.warp-mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--warp-accent-dim);
  color: var(--warp-accent);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
}
.warp-mode-badge::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--warp-accent);
}
.warp-brand {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--warp-text-dim);
  font-weight: 600;
}
.warp-rate {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.warp-rate-value {
  font-size: 40px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--warp-text);
  line-height: 1;
}
.warp-rate-suffix {
  font-size: 14px;
  color: var(--warp-text-dim);
  font-weight: 500;
}
.warp-lane {
  font-family: "Fira Code", ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 14px;
  color: var(--warp-text-dim);
  display: flex;
  align-items: center;
  gap: 10px;
}
.warp-lane-arrow {
  color: var(--warp-accent);
  font-weight: 600;
}
.warp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--warp-border);
  border-bottom: 1px solid var(--warp-border);
}
.warp-stat-label {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--warp-text-dim);
  margin-bottom: 4px;
}
.warp-stat-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--warp-text);
}
.warp-expires {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--warp-text-dim);
}
.warp-expires-countdown {
  font-family: "Fira Code", ui-monospace, "SF Mono", Menlo, monospace;
  color: var(--warp-text);
  font-weight: 500;
}
.warp-expires-countdown[data-expired="true"] {
  color: #FCA5A5;
}
.warp-book {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px 20px;
  background: var(--warp-accent);
  color: #0A0F1A;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: transform 0.06s ease, opacity 0.12s ease;
}
.warp-book:hover { opacity: 0.9; }
.warp-book:active { transform: scale(0.99); }
.warp-book-arrow {
  font-weight: 700;
}
.warp-footer {
  font-size: 11px;
  color: var(--warp-text-dim);
  text-align: center;
  margin-top: -4px;
}
.warp-footer a {
  color: var(--warp-text-dim);
  text-decoration: underline;
  text-decoration-color: var(--warp-border);
}
</style>
</head>
<body>
<div class="warp-card" id="__warp_card" role="region" aria-label="Warp freight quote">
  <div class="warp-header">
    <span class="warp-mode-badge" id="__warp_mode">Quote</span>
    <span class="warp-brand">Warp</span>
  </div>

  <div>
    <div class="warp-rate">
      <span class="warp-rate-value" id="__warp_rate">--</span>
      <span class="warp-rate-suffix">all-in</span>
    </div>
    <div class="warp-lane">
      <span id="__warp_origin">-----</span>
      <span class="warp-lane-arrow">→</span>
      <span id="__warp_dest">-----</span>
    </div>
  </div>

  <div class="warp-grid">
    <div>
      <div class="warp-stat-label">Equipment</div>
      <div class="warp-stat-value" id="__warp_vehicle">--</div>
    </div>
    <div>
      <div class="warp-stat-label">Pickup</div>
      <div class="warp-stat-value" id="__warp_pickup">--</div>
    </div>
    <div>
      <div class="warp-stat-label">Delivery</div>
      <div class="warp-stat-value" id="__warp_delivery">--</div>
    </div>
  </div>

  <div class="warp-expires">
    <span>Quote expires in</span>
    <span class="warp-expires-countdown" id="__warp_countdown">--:--</span>
  </div>

  <a class="warp-book" id="__warp_book" href="#" rel="noopener">
    Book this rate <span class="warp-book-arrow">→</span>
  </a>

  <div class="warp-footer" id="__warp_footer">
    Booking opens at <a href="https://customer.wearewarp.com" target="_blank" rel="noopener">customer.wearewarp.com</a>. Card required at checkout.
  </div>
</div>

${jsonScriptTag}

<script>
(function() {
  function readData() {
    try {
      var openaiData = (typeof window !== "undefined" && window.openai && window.openai.toolOutput && window.openai.toolOutput.structuredContent) || null;
      if (openaiData) return openaiData;
    } catch (e) {}
    try {
      var inline = document.getElementById("__warp_data");
      if (inline && inline.textContent) return JSON.parse(inline.textContent);
    } catch (e) {}
    return null;
  }

  var data = readData();
  if (!data) return;

  var MODE_LABEL = { van: "Cargo Van", "box-truck": "Box Truck", ftl: "Full Truckload", ltl: "LTL" };
  var PORTAL_MODE = { van: "cargo_van", "box-truck": "box_truck_26", ftl: "truck_53", ltl: "shared_ltl" };

  function fmtMoney(n) {
    return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function fmtDate(s) {
    if (!s) return "--";
    try {
      var d = new Date(s + "T12:00:00Z");
      return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
    } catch (e) { return s; }
  }

  document.getElementById("__warp_mode").textContent = MODE_LABEL[data.mode] || "Quote";
  document.getElementById("__warp_rate").textContent = fmtMoney(data.rate_usd);
  document.getElementById("__warp_origin").textContent = data.origin_zip;
  document.getElementById("__warp_dest").textContent = data.destination_zip;
  document.getElementById("__warp_vehicle").textContent = data.vehicle_label || MODE_LABEL[data.mode] || "--";
  document.getElementById("__warp_pickup").textContent = fmtDate(data.pickup_date);
  document.getElementById("__warp_delivery").textContent = fmtDate(data.delivery_date);

  // Footer adapts to whether a card is already on file. Authed quotes carry
  // payment_ready:true; keyless/anon quotes omit it, so they keep the default
  // "card required at checkout" guidance.
  var footerEl = document.getElementById("__warp_footer");
  if (footerEl && data.payment_ready) {
    footerEl.innerHTML = 'Card on file, ready to book at <a href="https://customer.wearewarp.com" target="_blank" rel="noopener">customer.wearewarp.com</a>.';
  }

  // Build the deep-link per the canonical schema (auto-fires the portal quote).
  var params = new URLSearchParams();
  params.set("originZip", data.origin_zip);
  params.set("destinationZip", data.destination_zip);
  params.set("pd", data.pickup_date);
  params.set("pc", String(data.pallets || 1));
  params.set("mp", PORTAL_MODE[data.mode] || "shared_ltl");
  params.set("utm_source", "mcp");
  params.set("utm_medium", "inline-widget");
  params.set("utm_campaign", "quote-card");
  if (data.quote_id) params.set("warp_quote_id", data.quote_id);
  var bookHref = "https://customer.wearewarp.com/public/freight-quote?" + params.toString();
  var bookEl = document.getElementById("__warp_book");
  bookEl.setAttribute("href", bookHref);
  bookEl.setAttribute("target", "_blank");

  // Expiration countdown — ticks every second until 00:00, then locks the CTA.
  var expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : (Date.now() + 15 * 60 * 1000);
  var countdownEl = document.getElementById("__warp_countdown");
  function tick() {
    var remaining = Math.max(0, expiresAt - Date.now());
    var totalSec = Math.floor(remaining / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    countdownEl.textContent = String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
    if (remaining === 0) {
      countdownEl.setAttribute("data-expired", "true");
      bookEl.style.opacity = "0.5";
      bookEl.style.pointerEvents = "none";
      bookEl.textContent = "Quote expired — request a new quote";
      clearInterval(timer);
    }
  }
  tick();
  var timer = setInterval(tick, 1000);
})();
</script>
</body>
</html>`;
}

// Returns the full HTML document with data embedded inline. Use this for the
// Claude inline-resource path where each tool call ships fresh HTML.
export function renderQuoteCard(data: QuoteWidgetData): string {
  const jsonScript = `<script id="__warp_data" type="application/json">${escapeJsonForScript(
    JSON.stringify(data),
  )}</script>`;
  return buildHtml(jsonScript);
}

// Returns the bare template (no data) for the ChatGPT Apps SDK resource path.
// ChatGPT fetches this once via resources/read and binds structuredContent at
// render time per-tool-call.
export function quoteCardTemplate(): string {
  return buildHtml("");
}

// JSON-LD safety: any "</script>" or "<script" inside the JSON payload would
// terminate the surrounding <script> tag and break parsing. Cortex hard rule
// 2026-05-19: always escape these when embedding JSON inside a <script> block.
function escapeJsonForScript(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script").replace(/<script/gi, "<\\script");
}
