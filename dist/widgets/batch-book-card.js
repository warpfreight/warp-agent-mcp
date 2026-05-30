// Inline batch-book widget for Warp MCP.
//
// warp_batch_book confirms (or fails) N bookings in one call, sequentially.
// This renders them as a single contained card: WΛRP header → "Batch book"
// summary (N booked · M failed) → a scrollable list, one row per lane
// (origin → dest · Booked/Failed pill · tracking number). Click a row to
// expand for tracking_url + order_id + quote_id + amount, or the error.
//
// Same dual-platform design as batch-quote-card.ts:
//   • ChatGPT (Apps SDK): ui://warp/batch-book-card  (text/html)
//   • Claude  (MCP Apps):  ui://warp/batch-book-card.mcp (text/html;profile=mcp-app)
// Non-UI clients ignore both and fall back to the JSON text.
import { MCP_APP_MIME_TYPE } from "./quote-card.js";
import { BATCH_BOOK_APP_CLIENT_BUNDLE } from "./batch-book-card-client-bundle.js";
export const BATCH_BOOK_CARD_RESOURCE_URI = "ui://warp/batch-book-card";
export const BATCH_BOOK_CARD_MCP_RESOURCE_URI = "ui://warp/batch-book-card.mcp";
function str(v, fb = "") { return typeof v === "string" ? v : v == null ? fb : String(v); }
function num(v, fb = 0) { return typeof v === "number" && Number.isFinite(v) ? v : fb; }
// Canonical public tracking URL — matches the bookings-card helper so the
// model never has to fabricate links. orderNumber starts with "P-…" for booked
// shipments; if it's missing we degrade to an empty string and the card hides
// the link.
function trackingUrl(orderNumber) {
    if (!orderNumber)
        return "";
    return `https://tracking.wearewarp.com/${encodeURIComponent(orderNumber)}`;
}
/**
 * Map the client.batchBook() result array into the widget shape.
 */
export function toBatchBookWidgetData(raw) {
    if (!Array.isArray(raw) || raw.length === 0)
        return null;
    const rows = raw.map((r) => {
        // The gw response (carried through in r.raw) sometimes returns orderNumber
        // alongside trackingNumber/orderId — prefer it for the tracking URL because
        // /tracking/<P-…> is the public-facing path.
        const rawData = r.raw && typeof r.raw === "object" ? r.raw : {};
        const orderNumber = str(rawData.orderNumber) || str(r.order_id);
        return {
            row: r.row,
            ok: r.ok === true,
            quote_id: str(r.quote_id),
            pickup_zip: str(r.pickup_zip),
            delivery_zip: str(r.delivery_zip),
            tracking_number: str(r.tracking_number),
            order_id: str(r.order_id),
            tracking_url: trackingUrl(orderNumber),
            booking_url: str(r.booking_url),
            amount_usd: num(r.amount_usd),
            error: str(r.error),
        };
    });
    const succeeded = rows.filter((r) => r.ok).length;
    const totalAmount = rows.reduce((sum, r) => sum + (r.ok ? r.amount_usd : 0), 0);
    return {
        type: "batch_book",
        total: rows.length,
        succeeded,
        failed: rows.length - succeeded,
        total_amount_usd: totalAmount,
        rows,
    };
}
// Theme-adaptive card chrome (same palette as batch-quote-card / bookings-card).
const CARD_CSS = `
:root {
  --card: #ffffff; --line: #eceae3; --line2: #f3f1ec;
  --text: #1c1b19; --muted: #6f7480; --dim: #9a9ea6;
  --accent: #15803d; --accent-soft: rgba(21,128,61,0.10); --warp-tint: rgba(21,128,61,0.045);
  --icon-bg: #f1f0ec; --icon-text: #5b6068; --logo: #15803d; --shadow: 0 1px 3px rgba(0,0,0,0.05);
  --pill-bg: #f1f0ec; --pill-text: #5b6068;
  --bad: #b91c1c; --bad-bg: rgba(185,28,28,0.10);
  --link: #15803d;
}
@media (prefers-color-scheme: dark) {
  :root {
    --card: #1b1b1d; --line: #2f2f32; --line2: #262629;
    --text: #ececed; --muted: #9a9aa2; --dim: #71717a;
    --accent: #3EE07F; --accent-soft: rgba(62,224,127,0.14); --warp-tint: rgba(62,224,127,0.06);
    --icon-bg: #27272a; --icon-text: #b6b6bd; --logo: #00FF33; --shadow: 0 1px 3px rgba(0,0,0,0.25);
    --pill-bg: #27272a; --pill-text: #b6b6bd;
    --bad: #f87171; --bad-bg: rgba(248,113,113,0.14);
    --link: #3EE07F;
  }
}
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

.bb-scroll { max-height: 460px; overflow-y: auto; border-top: 1px solid var(--line2); -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
.bb-scroll::-webkit-scrollbar { width: 8px; }
.bb-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.bb-scroll::-webkit-scrollbar-track { background: transparent; }

.bb-item + .bb-item { border-top: 1px solid var(--line2); }
.bb-item { animation: warpItemIn 0.4s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.2s ease; }
.bb-item.open { background: var(--warp-tint); }
.bb-item.err { background: var(--bad-bg); }
.bb-item.err.open { background: var(--bad-bg); }

.bb-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: 11px; padding: 10px 16px; cursor: pointer; user-select: none; }
.bb-row:hover { background: var(--line2); }
.bb-item.open .bb-row:hover { background: transparent; }
.bb-row-no { color: var(--dim); font-size: 11px; font-variant-numeric: tabular-nums; text-align: center; font-weight: 600; }
.bb-row-main { min-width: 0; }
.bb-row-top { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.bb-lane { font-weight: 650; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.bb-pill { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); text-transform: uppercase; letter-spacing: 0.04em; }
.bb-pill.bad { background: var(--bad-bg); color: var(--bad); }
.bb-meta { color: var(--muted); font-size: 11.5px; margin-top: 3px; line-height: 1.35; font-variant-numeric: tabular-nums; }
.bb-row-pr { font-weight: 700; font-size: 13.5px; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.bb-row-pr small { display: block; color: var(--muted); font-weight: 500; font-size: 10.5px; margin-top: 1px; }
.bb-row-pr.bad { color: var(--bad); font-size: 11.5px; font-weight: 600; }

.bb-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.4,0,0.2,1); }
.bb-item.open .bb-detail { grid-template-rows: 1fr; }
.bb-detail-clip { min-height: 0; overflow: hidden; }
.bb-detail-inner { padding: 6px 16px 14px 55px; opacity: 0; transform: translateY(-4px); transition: opacity 0.22s ease, transform 0.28s ease; }
.bb-item.open .bb-detail-inner { opacity: 1; transform: none; transition-delay: 0.06s; }
.bb-kv { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4; }
.bb-kv b { color: var(--text); font-weight: 600; }
.bb-link { color: var(--link); text-decoration: none; font-weight: 600; }
.bb-link:hover { text-decoration: underline; }
.bb-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; color: var(--dim); margin-top: 8px; word-break: break-all; }

.wm-foot { padding: 11px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 12px; text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .wcard, .bb-item { animation: none !important; }
  .bb-detail, .bb-detail-inner, .bb-item { transition: none !important; }
}`;
const CARD_BODY = `<div class="warp-root" id="__warp_bb_root"></div>`;
const RENDER_FN_JS = `
window.__warpToggleBookRow = function(idx) {
  var item = document.getElementById("__warp_bb_item_" + idx);
  if (!item) return;
  item.classList.toggle("open");
};
window.__warpRenderBatchBook = function(data) {
  var root = document.getElementById("__warp_bb_root");
  if (!root || !data || !Array.isArray(data.rows)) return;
  var LOGO = '<svg viewBox="0 0 660 186" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WARP"><path d="M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z" fill="currentColor"/><path d="M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z" fill="currentColor"/><path d="M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z" fill="currentColor"/><path d="M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z" fill="currentColor"/><path d="M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z" fill="currentColor"/><path d="M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z" fill="currentColor"/><path d="M292.04 76.1794H275.219V94.1557H292.04V76.1794Z" fill="currentColor"/><path d="M275.219 131.615H292.04V113.84H275.219V131.615Z" fill="currentColor"/></svg>';

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c];}); }
  function money(n){ var v = Number(n); if (!isFinite(v) || v === 0) return ""; return "$" + Math.round(v).toLocaleString("en-US"); }

  var SEP = ' &#183; ';
  var h = '<div class="wcard">';
  h += '<div class="wh-head"><span class="wh-logo">' + LOGO + '</span><span class="wh-ti">Freight</span></div>';

  var sub = data.total + (data.total===1?' shipment':' shipments')
    + (data.succeeded>0 ? SEP + data.succeeded + ' booked' : '')
    + (data.failed>0   ? SEP + data.failed   + ' failed'  : '')
    + (data.total_amount_usd>0 ? SEP + money(data.total_amount_usd) + ' charged' : '');
  h += '<div class="wh-sec"><div class="st">Batch book</div><div class="ss">' + sub + '</div></div>';

  h += '<div class="bb-scroll">';
  data.rows.forEach(function(R, idx){
    var delay = Math.min(idx, 12) * 30;
    var cls = R.ok ? "" : " err";
    h += '<div class="bb-item' + cls + '" id="__warp_bb_item_' + idx + '" style="animation-delay:' + delay + 'ms">';
    h += '<div class="bb-row" data-warp-bb-idx="' + idx + '">';
    h += '<div class="bb-row-no">' + R.row + '</div>';

    var lane = (R.pickup_zip || R.delivery_zip)
      ? (esc(R.pickup_zip || "?") + ' &#8594; ' + esc(R.delivery_zip || "?"))
      : 'quote ' + esc((R.quote_id || "").slice(0, 14));

    h += '<div class="bb-row-main"><div class="bb-row-top">' +
         '<span class="bb-lane">' + lane + '</span>' +
         '<span class="bb-pill' + (R.ok ? "" : " bad") + '">' + (R.ok ? 'Booked' : 'Failed') + '</span>' +
         '</div>';

    var meta = [];
    if (R.ok && R.tracking_number) meta.push(R.tracking_number);
    if (R.ok && R.amount_usd)      meta.push(money(R.amount_usd) + ' charged');
    if (!R.ok && R.error)          meta.push(R.error.length > 60 ? R.error.slice(0,60)+"…" : R.error);
    h += '<div class="bb-meta">' + meta.map(esc).join(SEP) + '</div></div>';

    if (R.ok && R.tracking_url) {
      h += '<div class="bb-row-pr"><a class="bb-link" href="' + esc(R.tracking_url) + '" target="_blank" rel="noopener">Track</a></div>';
    } else if (!R.ok) {
      h += '<div class="bb-row-pr bad">No booking</div>';
    } else {
      h += '<div class="bb-row-pr"></div>';
    }
    h += '</div>'; // bb-row

    // expandable detail
    var det = '<div class="bb-detail"><div class="bb-detail-clip"><div class="bb-detail-inner">';
    if (R.ok) {
      var bits = [];
      if (R.tracking_number) bits.push('tracking <b>' + esc(R.tracking_number) + '</b>');
      if (R.order_id)        bits.push('order <b>' + esc(R.order_id) + '</b>');
      if (R.amount_usd)      bits.push('charged <b>' + money(R.amount_usd) + '</b>');
      det += '<div class="bb-kv">' + bits.join(SEP) + '</div>';
      if (R.tracking_url) det += '<div class="bb-kv"><a class="bb-link" href="' + esc(R.tracking_url) + '" target="_blank" rel="noopener">Track shipment &#8599;</a></div>';
      if (R.quote_id)  det += '<div class="bb-id">quote_id &middot; ' + esc(R.quote_id) + '</div>';
    } else {
      det += '<div class="bb-kv"><b>Error:</b> ' + esc(R.error || "Unknown error") + '</div>';
      if (R.quote_id) det += '<div class="bb-id">quote_id &middot; ' + esc(R.quote_id) + '</div>';
      det += '<div class="bb-kv" style="margin-top:8px">Re-quote this lane (id expired) and retry just this row.</div>';
    }
    det += '</div></div></div>';
    h += det;

    h += '</div>'; // bb-item
  });
  h += '</div>'; // bb-scroll

  h += '<div class="wm-foot">Click a row for tracking &amp; details</div>';
  h += '</div>'; // card
  root.innerHTML = h;

  // Delegated click — CSP-safe, no inline onclick. Ignore clicks on links so
  // the Track link doesn't also toggle the row.
  root.addEventListener("click", function(ev){
    var t = ev.target;
    while (t && t !== root) {
      if (t.tagName === "A") return;
      if (t.classList && t.classList.contains("bb-row")) {
        window.__warpToggleBookRow(t.getAttribute("data-warp-bb-idx"));
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
      var inline = document.getElementById("__warp_bb_data");
      if (inline && inline.textContent) return JSON.parse(inline.textContent);
    } catch (e) {}
    return null;
  }
  var data = readData();
  if (data) window.__warpRenderBatchBook(data);
})();`;
function buildHtml(opts) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Warp Batch Book</title>
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
export function renderBatchBookCard(data) {
    const jsonScript = `<script id="__warp_bb_data" type="application/json">${escapeJsonForScript(JSON.stringify(data))}</script>`;
    return buildHtml({ clientScript: OPENAI_CLIENT_JS, dataScript: jsonScript });
}
export function batchBookCardTemplate() {
    return buildHtml({ clientScript: OPENAI_CLIENT_JS });
}
export function batchBookCardMcpTemplate() {
    return buildHtml({ clientScript: BATCH_BOOK_APP_CLIENT_BUNDLE });
}
export { MCP_APP_MIME_TYPE };
function escapeJsonForScript(s) {
    return s.replace(/<\/script/gi, "<\\/script").replace(/<script/gi, "<\\script");
}
//# sourceMappingURL=batch-book-card.js.map