import { WARP_TOKENS_CSS, FORKLIFT_CSS, FORKLIFT_HTML, FORKLIFT_JS, } from "./warp-theme.js";
// Inline batch-quote widget for Warp MCP.
//
// warp_batch_quote returns prices for N lanes in one call (parallel fan-out);
// this renders them as a single contained card: WΛRP header → "Batch quote"
// summary (N lanes · X priced · Y skipped) → a scrollable list, one row per
// lane (origin → dest · mode pill · pallets · price · transit). Click a row
// to expand its quote_id + full quote detail (so the user can ask
// "book row 3"). Failed lanes render with a red error pill.
//
// Same dual-platform design as quote-card.ts / bookings-card.ts:
//   • ChatGPT (Apps SDK): ui://warp/batch-quote-card  (text/html)
//   • Claude  (MCP Apps):  ui://warp/batch-quote-card.mcp (text/html;profile=mcp-app)
// Non-UI clients ignore both and fall back to the JSON text.
import { MCP_APP_MIME_TYPE } from "./quote-card.js";
import { BATCH_QUOTE_APP_CLIENT_BUNDLE } from "./batch-quote-card-client-bundle.js";
export const BATCH_QUOTE_CARD_RESOURCE_URI = "ui://warp/batch-quote-card";
export const BATCH_QUOTE_CARD_MCP_RESOURCE_URI = "ui://warp/batch-quote-card.mcp";
function str(v, fb = "") { return typeof v === "string" ? v : v == null ? fb : String(v); }
function num(v, fb = 0) { return typeof v === "number" && Number.isFinite(v) ? v : fb; }
function rec(v) { return v && typeof v === "object" ? v : {}; }
/**
 * Map the client.batchQuote() result array into the widget shape.
 */
export function toBatchQuoteWidgetData(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        return null;
    const lanes = raw.map((r) => {
        const input = rec(r.input);
        const result = rec(r.result);
        const price = num(result.warp_price ?? result.price_usd);
        const pallets = num(input.pallets, 1);
        return {
            row: r.row,
            ok: r.ok === true,
            mode: (["ltl", "ftl", "van", "box-truck"].includes(r.mode) ? r.mode : "ltl"),
            origin_zip: str(input.origin_zip),
            destination_zip: str(input.destination_zip),
            pickup_date: str(input.pickup_date),
            pallets,
            weight_lbs_per_pallet: num(input.weight_lbs_per_pallet),
            commodity: str(input.commodity),
            quote_id: str(result.warp_quote_id ?? result.quote_id),
            price_usd: price,
            per_pallet: pallets > 0 ? price / pallets : price,
            transit_days: num(result.warp_transit_days ?? result.transit_days),
            delivery_date: str(result.delivery_date),
            expires_at: str(result.expires_at),
            error: str(r.error),
        };
    });
    const succeeded = lanes.filter((l) => l.ok).length;
    return {
        type: "batch_quote",
        total: lanes.length,
        succeeded,
        failed: lanes.length - succeeded,
        lanes,
    };
}
// Theme-adaptive card chrome (same palette as quote-card / bookings-card).
const CARD_CSS = `
${WARP_TOKENS_CSS}
${FORKLIFT_CSS}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: transparent; color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px; -webkit-font-smoothing: antialiased;
}
.warp-root { max-width: 620px; margin: 0 auto; padding: 8px; }
.wcard { background: var(--card); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; box-shadow: var(--shadow);
  animation: warpCardIn 0.42s cubic-bezier(0.16,1,0.3,1) both; }
@keyframes warpCardIn { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes warpItemIn { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }

.wh-head { display: flex; align-items: center; gap: 9px; padding: 13px 16px; border-bottom: 1px solid var(--line); }
.wh-logo { color: var(--logo); display: flex; align-items: center; }
.wh-logo svg { height: 17px; width: auto; display: block; }
.wh-ti { font-weight: 600; font-size: 13.5px; color: var(--text); }
.wh-sec { padding: 13px 16px 8px; }
.wh-sec .st { font-weight: 700; font-size: 14.5px; }
.wh-sec .ss { color: var(--muted); font-size: 12.5px; margin-top: 3px; }

.bq-scroll { max-height: 460px; overflow-y: auto; border-top: 1px solid var(--line2); -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
.bq-scroll::-webkit-scrollbar { width: 8px; }
.bq-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.bq-scroll::-webkit-scrollbar-track { background: transparent; }

.bq-item + .bq-item { border-top: 1px solid var(--line2); }
.bq-item { animation: warpItemIn 0.4s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.2s ease; }
.bq-item.open { background: var(--warp-tint); }
.bq-item.err { background: var(--bad-bg); }
.bq-item.err.open { background: var(--bad-bg); }

.bq-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 11px; padding: 10px 16px; cursor: pointer; user-select: none; }
.bq-row:hover { background: var(--line2); }
.bq-item.open .bq-row:hover { background: transparent; }
.bq-row-no { color: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; text-align: center; font-weight: 600; }
.bq-row-main { min-width: 0; }
.bq-row-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.bq-lane { font-weight: 650; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.bq-pill { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.bq-pill.bad { background: var(--bad-bg); color: var(--bad); }
.bq-meta { color: var(--muted); font-size: 11.5px; margin-top: 3px; line-height: 1.35; }
.bq-row-pr { font-weight: 700; font-size: 14.5px; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.bq-row-pr small { display: block; color: var(--muted); font-weight: 500; font-size: 10.5px; margin-top: 1px; }
.bq-row-pr.bad { color: var(--bad); font-size: 11.5px; font-weight: 600; }

.bq-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.4,0,0.2,1); }
.bq-item.open .bq-detail { grid-template-rows: 1fr; }
.bq-detail-clip { min-height: 0; overflow: hidden; }
.bq-detail-inner { padding: 6px 16px 14px 55px; opacity: 0; transform: translateY(-4px); transition: opacity 0.22s ease, transform 0.28s ease; }
.bq-item.open .bq-detail-inner { opacity: 1; transform: none; transition-delay: 0.06s; }
.bq-kv { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4; }
.bq-kv b { color: var(--text); font-weight: 600; }
.bq-qid { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dim); margin-top: 8px; word-break: break-all; }

.wm-foot { padding: 11px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 12px; text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .wcard, .bq-item { animation: none !important; }
  .bq-detail, .bq-detail-inner, .bq-item { transition: none !important; }
}`;
const CARD_BODY = `<div class="warp-root" id="__warp_bq_root"></div>`;
const RENDER_FN_JS = `
var FORKLIFT_SLOT = ${JSON.stringify(FORKLIFT_HTML)};
window.__warpToggleBatchRow = function(idx) {
  var item = document.getElementById("__warp_bq_item_" + idx);
  if (!item) return;
  item.classList.toggle("open");
};
window.__warpRenderBatchQuote = function(data) {
  var root = document.getElementById("__warp_bq_root");
  if (!root || !data || !Array.isArray(data.lanes)) return;
  var LOGO = '<svg viewBox="0 0 660 186" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WARP"><path d="M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z" fill="currentColor"/><path d="M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z" fill="currentColor"/><path d="M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z" fill="currentColor"/><path d="M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z" fill="currentColor"/><path d="M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z" fill="currentColor"/><path d="M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z" fill="currentColor"/><path d="M292.04 76.1794H275.219V94.1557H292.04V76.1794Z" fill="currentColor"/><path d="M275.219 131.615H292.04V113.84H275.219V131.615Z" fill="currentColor"/></svg>';

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c];}); }
  function money(n){ var v = Number(n); if (!isFinite(v) || v === 0) return "—"; return "$" + Math.round(v).toLocaleString("en-US"); }
  function fmtDate(s){ if(!s) return ""; try{ var d=new Date(s+"T12:00:00Z"); return d.toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"UTC"});}catch(e){return s;} }
  function days(n){ n=Number(n)||0; if (!n) return "—"; return n + (n===1?" day":" days"); }
  function modeLabel(m){ return ({ltl:"LTL","box-truck":"Box Truck",ftl:"FTL",van:"Cargo Van"})[m] || (m||"").toUpperCase(); }

  var SEP = ' &#183; ';
  var h = '<div class="wcard">';
  h += '<div class="wh-head"><span class="wh-logo">' + LOGO + '</span><span class="wh-ti">Freight</span>' + FORKLIFT_SLOT + '</div>';

  var sub = data.total + (data.total===1?' lane':' lanes')
    + (data.succeeded>0 ? SEP + data.succeeded + ' priced' : '')
    + (data.failed>0 ? SEP + data.failed + ' skipped' : '');
  h += '<div class="wh-sec"><div class="st">Batch quote</div><div class="ss">' + sub + '</div></div>';

  h += '<div class="bq-scroll">';
  data.lanes.forEach(function(L, idx){
    var delay = Math.min(idx, 12) * 30;
    var cls = L.ok ? "" : " err";
    h += '<div class="bq-item' + cls + '" id="__warp_bq_item_' + idx + '" style="animation-delay:' + delay + 'ms">';
    h += '<div class="bq-row" data-warp-bq-idx="' + idx + '">';
    h += '<div class="bq-row-no">' + L.row + '</div>';
    h += '<div class="bq-row-main"><div class="bq-row-top">' +
         '<span class="bq-lane">' + esc(L.origin_zip||"?") + ' &#8594; ' + esc(L.destination_zip||"?") + '</span>' +
         '<span class="bq-pill' + (L.ok?"":" bad") + '">' + esc(modeLabel(L.mode)) + '</span>' +
         (L.ok ? '' : '<span class="bq-pill bad">Failed</span>') +
         '</div>';

    var meta = [];
    if (L.pallets) meta.push(L.pallets + (L.pallets===1?" pallet":" pallets"));
    if (L.weight_lbs_per_pallet) meta.push(L.weight_lbs_per_pallet + " lbs ea");
    if (L.pickup_date) meta.push("pickup " + fmtDate(L.pickup_date));
    h += '<div class="bq-meta">' + meta.join(SEP) + '</div></div>';

    if (L.ok) {
      h += '<div class="bq-row-pr">' + money(L.price_usd) +
           (L.mode === "ltl" && L.per_pallet ? '<small>' + money(L.per_pallet) + ' / pallet</small>' : '<small>' + days(L.transit_days) + '</small>') +
           '</div>';
    } else {
      h += '<div class="bq-row-pr bad">No rate</div>';
    }
    h += '</div>'; // bq-row

    // expandable detail
    var det = '<div class="bq-detail"><div class="bq-detail-clip"><div class="bq-detail-inner">';
    if (L.ok) {
      var detailBits = [];
      if (L.transit_days) detailBits.push('<b>' + days(L.transit_days) + '</b> transit');
      if (L.delivery_date) detailBits.push('delivery ' + fmtDate(L.delivery_date));
      if (L.commodity) detailBits.push('commodity: ' + esc(L.commodity));
      det += '<div class="bq-kv">' + detailBits.join(SEP) + '</div>';
      if (L.quote_id) det += '<div class="bq-qid">quote_id &middot; ' + esc(L.quote_id) + '</div>';
      det += '<div class="bq-kv" style="margin-top:8px"><b>Ask me to book row ' + L.row + '</b> to charge & dispatch this lane.</div>';
    } else {
      det += '<div class="bq-kv"><b>Error:</b> ' + esc(L.error || "Unknown error") + '</div>';
      det += '<div class="bq-kv">Check the lane inputs (zip codes, pickup date, weight) and retry just this row.</div>';
    }
    det += '</div></div></div>';
    h += det;

    h += '</div>'; // bq-item
  });
  h += '</div>'; // bq-scroll

  h += '<div class="wm-foot">Click a row for details &#183; each priced lane is bookable (ask me to book row N)</div>';
  h += '</div>'; // card
  root.innerHTML = h;
  try { if (window.__warpForklift) window.__warpForklift(); } catch (e) {}

  // Delegated click — CSP-safe, no inline onclick.
  root.addEventListener("click", function(ev){
    var t = ev.target;
    while (t && t !== root) {
      if (t.classList && t.classList.contains("bq-row")) {
        window.__warpToggleBatchRow(t.getAttribute("data-warp-bq-idx"));
        return;
      }
      t = t.parentNode;
    }
  });
};`;
const OPENAI_CLIENT_JS = `
(function() {
  function readData() {
    try {
      var o = (typeof window !== "undefined" && window.openai && window.openai.toolOutput && window.openai.toolOutput.structuredContent) || null;
      if (o) return o;
    } catch (e) {}
    try {
      var inline = document.getElementById("__warp_bq_data");
      if (inline && inline.textContent) return JSON.parse(inline.textContent);
    } catch (e) {}
    return null;
  }
  var data = readData();
  if (data) window.__warpRenderBatchQuote(data);
})();`;
function buildHtml(opts) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Warp Batch Quote</title>
<style>${CARD_CSS}</style>
</head>
<body>
${CARD_BODY}

${opts.dataScript ?? ""}

<script>${FORKLIFT_JS}</script>
<script>${RENDER_FN_JS}</script>
<script>${opts.clientScript}</script>
</body>
</html>`;
}
export function renderBatchQuoteCard(data) {
    const jsonScript = `<script id="__warp_bq_data" type="application/json">${escapeJsonForScript(JSON.stringify(data))}</script>`;
    return buildHtml({ clientScript: OPENAI_CLIENT_JS, dataScript: jsonScript });
}
export function batchQuoteCardTemplate() {
    return buildHtml({ clientScript: OPENAI_CLIENT_JS });
}
export function batchQuoteCardMcpTemplate() {
    return buildHtml({ clientScript: BATCH_QUOTE_APP_CLIENT_BUNDLE });
}
export { MCP_APP_MIME_TYPE };
function escapeJsonForScript(s) {
    return s.replace(/<\/script/gi, "<\\/script").replace(/<script/gi, "<\\script");
}
//# sourceMappingURL=batch-quote-card.js.map