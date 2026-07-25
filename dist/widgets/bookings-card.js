import { WARP_TOKENS_CSS, FORKLIFT_CSS, FORKLIFT_HTML, FORKLIFT_JS, } from "./warp-theme.js";
// Inline bookings/shipments widget for Warp MCP — a mini-TMS card.
//
// warp_list_bookings returns a list of shipments; this renders them as a single
// contained card: Warp wordmark header → "Your shipments" + count → a scrollable
// list of shipment rows. Each row is CLICKABLE: tapping it expands an inline
// detail panel (pickup + delivery addresses/contacts/windows, freight, order
// references) and a "Track shipment" button that deep-links to the real public
// tracking page. So the agent feels like a TMS the user can click into.
//
// Tracking URL is the canonical public one used by the Warp customer app:
//   https://tracking.wearewarp.com/<shipmentNumber>   (shipmentNumber = S-XXXXX-XXXX)
// The S- shipment number is the key the public tracking page resolves (confirmed
// against the live page search box). The P- order number is shown for
// reconciliation only — it is NOT the tracking key.
//
// Same dual-platform design as quote-card.ts — ONE painter
// (window.__warpRenderBookings), two delivery paths:
//   • ChatGPT (Apps SDK): window.openai.toolOutput.structuredContent.
//     Resource: ui://warp/bookings-card  (text/html)
//   • Claude (MCP Apps / SEP-1865): tool result over the postMessage bridge.
//     Resource: ui://warp/bookings-card.mcp (text/html;profile=mcp-app)
// Non-UI clients ignore both and fall back to the text JSON.
import { MCP_APP_MIME_TYPE } from "./quote-card.js";
import { BOOKINGS_APP_CLIENT_BUNDLE } from "./bookings-card-client-bundle.js";
export const BOOKINGS_CARD_RESOURCE_URI = "ui://warp/bookings-card";
export const BOOKINGS_CARD_MCP_RESOURCE_URI = "ui://warp/bookings-card.mcp";
// Canonical public tracking host (Warp customer app: src/lib/tracking-resolver.ts).
export const TRACKING_BASE_URL = "https://tracking.wearewarp.com";
/** Build the public tracking URL for a shipment from its S- shipment number. */
export function trackingUrl(shipmentNumber) {
    const code = (shipmentNumber ?? "").trim();
    return code ? `${TRACKING_BASE_URL}/${encodeURIComponent(code)}` : "";
}
function str(v, fallback = "") {
    return typeof v === "string" ? v : v == null ? fallback : String(v);
}
function num(v, fallback = 0) {
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function rec(v) {
    return v && typeof v === "object" ? v : {};
}
function mapParty(info) {
    const i = rec(info);
    const addr = rec(i.address);
    const meta = rec(addr.metadata);
    const contacts = Array.isArray(i.contacts) ? i.contacts : [];
    const c = rec(contacts[0]);
    const windows = Array.isArray(i.windows) ? i.windows : [];
    const w = rec(windows[0]);
    return {
        name: str(i.locationName) || str(addr.formatedAddress),
        street: str(addr.street),
        city: str(addr.city),
        state: str(addr.state),
        zip: str(addr.zipcode) || str(addr.zip),
        contact_name: str(c.fullName) || [str(c.firstName), str(c.lastName)].filter(Boolean).join(" "),
        contact_phone: str(c.phone),
        contact_email: str(c.email),
        window_from: str(w.from),
        window_to: str(w.to),
        tz: str(meta.timeZoneStandard),
    };
}
function mapFreight(items) {
    if (!Array.isArray(items))
        return [];
    return items.map((raw) => {
        const it = rec(raw);
        return {
            name: str(it.name, "Item"),
            qty: num(it.qty),
            qty_unit: str(it.qtyUnit, "unit"),
            weight_per_unit: num(it.weightPerUnit),
            weight_unit: str(it.weightUnit, "lbs"),
            length: num(it.length),
            width: num(it.width),
            height: num(it.height),
            size_unit: str(it.sizeUnit, "IN"),
            hazardous: it.isHazardous === true,
            stackable: it.stackable === true,
        };
    });
}
/**
 * Map the gw /freights/shipments response (or a single tracking record) into the
 * widget shape. Accepts either { data: [...] } (list) or a bare array.
 */
export function toBookingsWidgetData(response) {
    const r = rec(response);
    const rows = Array.isArray(response)
        ? response
        : Array.isArray(r.data)
            ? r.data
            : [];
    if (!rows.length)
        return null;
    const shipments = rows.map((raw) => {
        const s = rec(raw);
        const pickup = mapParty(s.pickupInfo);
        const delivery = mapParty(s.deliveryInfo);
        const orderNumber = str(s.orderNumber);
        const shipmentNumber = str(s.shipmentNumber) || str(s.trackingNumber);
        const statusInfo = rec(s.statusInfo);
        return {
            shipment_number: shipmentNumber,
            order_number: orderNumber,
            tracking_number: str(s.trackingNumber) || str(s.shipmentNumber),
            tracking_url: trackingUrl(shipmentNumber),
            mode: str(s.shipmentType, "LTL"),
            status: str(s.status) || str(statusInfo.status),
            created: str(s.createDate),
            origin_city: pickup.city,
            origin_state: pickup.state,
            origin_zip: pickup.zip,
            dest_city: delivery.city,
            dest_state: delivery.state,
            dest_zip: delivery.zip,
            pickup,
            delivery,
            freight: mapFreight(s.listItems),
        };
    });
    const total = num(r.total, shipments.length);
    return { type: "bookings", total, shown: shipments.length, shipments };
}
// Reuses the quote-card palette + card chrome (same CSS variables), plus
// shipment-row + expandable-detail styling. Transparent page, theme-adaptive.
const CARD_CSS = `
${WARP_TOKENS_CSS}
${FORKLIFT_CSS}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0; background: transparent; color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px; -webkit-font-smoothing: antialiased;
}
.warp-root { max-width: 580px; margin: 0 auto; padding: 8px; }
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

.wb-scroll { max-height: 420px; overflow-y: auto; border-top: 1px solid var(--line2); -webkit-overflow-scrolling: touch; scroll-behavior: smooth; }
.wb-scroll::-webkit-scrollbar { width: 8px; }
.wb-scroll::-webkit-scrollbar-thumb { background: var(--line); border-radius: 999px; }
.wb-scroll::-webkit-scrollbar-track { background: transparent; }
.wb-item + .wb-item { border-top: 1px solid var(--line2); }
.wb-item { animation: warpItemIn 0.44s cubic-bezier(0.16,1,0.3,1) both; transition: background 0.2s ease; }
.wb-item.open { background: var(--warp-tint); }

.wb-row { display: flex; align-items: center; gap: 11px; padding: 11px 16px; cursor: pointer; user-select: none; }
.wb-row:hover { background: var(--line2); }
.wb-item.open .wb-row:hover { background: transparent; }
.wb-chev { flex: 0 0 auto; color: var(--dim); display: flex; align-items: center; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1), color 0.2s ease; }
.wb-item.open .wb-chev { transform: rotate(90deg); color: var(--accent); }
.wb-main { flex: 1 1 auto; min-width: 0; }
.wb-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wb-num { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; letter-spacing: 0.01em; }
.wb-pill { font-size: 9.5px; font-weight: 700; padding: 2px 7px; border-radius: 999px; background: var(--pill-bg); color: var(--pill-text); text-transform: uppercase; letter-spacing: 0.04em; }
.wb-pill.mode { background: var(--accent-soft); color: var(--accent); }
.wb-pill.ok { background: var(--ok-bg); color: var(--ok); }
.wb-pill.warn { background: var(--warn-bg); color: var(--warn); }
.wb-pill.bad { background: var(--bad-bg); color: var(--bad); }
.wb-lane { font-weight: 600; font-size: 13.5px; margin-top: 4px; }
.wb-meta { color: var(--muted); font-size: 12px; margin-top: 3px; }
.wb-amt { flex: 0 0 auto; text-align: right; color: var(--muted); font-size: 11.5px; white-space: nowrap; }

/* Smooth open/close via the grid-rows 0fr→1fr trick (animates to auto height). */
.wb-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.3s cubic-bezier(0.4,0,0.2,1); }
.wb-item.open .wb-detail { grid-template-rows: 1fr; }
.wb-detail-clip { min-height: 0; overflow: hidden; }
.wb-detail-inner { padding: 4px 16px 16px 41px; opacity: 0; transform: translateY(-4px); transition: opacity 0.22s ease, transform 0.28s ease; }
.wb-item.open .wb-detail-inner { opacity: 1; transform: none; transition-delay: 0.06s; }
.wb-cols { display: flex; gap: 14px; }
.wb-col { flex: 1 1 0; min-width: 0; }
.wb-col-h { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--dim); margin: 4px 0 5px; }
.wb-addr { font-size: 12.5px; line-height: 1.45; }
.wb-kv { font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4; }
.wb-kv b { color: var(--text); font-weight: 600; }
.wb-block { margin-top: 12px; }
.wb-block .wb-col-h { margin-bottom: 4px; }
.wb-freight-line { font-size: 12.5px; line-height: 1.5; }
.wb-refs { margin-top: 12px; font-size: 11px; color: var(--dim); font-variant-numeric: tabular-nums; line-height: 1.5; }
.wb-actions { margin-top: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.wb-track { display: inline-flex; align-items: center; gap: 6px; background: var(--accent); color: #fff; font-weight: 650; font-size: 12px; padding: 7px 13px; border-radius: 8px; text-decoration: none; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.08); transition: transform 0.12s ease, filter 0.15s ease, box-shadow 0.15s ease; }
.wb-track svg { opacity: 0.9; }
.wb-track:hover { filter: brightness(1.04); transform: translateY(-1px); box-shadow: 0 3px 9px rgba(21,128,61,0.22); }
.wb-track:active { transform: translateY(0); filter: brightness(0.98); }
@media (prefers-color-scheme: dark) { .wb-track { color: #08130c; box-shadow: none; } .wb-track:hover { box-shadow: 0 3px 10px rgba(62,224,127,0.25); } }
.wb-hint { display: inline-flex; align-items: center; font-size: 11.5px; color: var(--muted); }
.wm-foot { padding: 11px 16px; border-top: 1px solid var(--line); color: var(--dim); font-size: 12px; text-align: center; }
@media (prefers-reduced-motion: reduce) {
  .wcard, .wb-item { animation: none !important; }
  .wb-detail, .wb-detail-inner, .wb-chev, .wb-item { transition: none !important; }
}`;
const CARD_BODY = `<div class="warp-root" id="__warp_bk_root"></div>`;
// Shared painter — builds the bookings card DOM. One definition; both the
// ChatGPT reader and the Claude App client call it.
const RENDER_FN_JS = `
var FORKLIFT_SLOT = ${JSON.stringify(FORKLIFT_HTML)};
window.__warpToggleShipment = function(idx) {
  var item = document.getElementById("__warp_bk_item_" + idx);
  if (!item) return;
  var willOpen = !(item.classList.contains("open"));
  // Class-only toggle; CSS animates the grid-rows expand + chevron rotation.
  item.classList.toggle("open");
  // On open, bring the row header to the top of the scroll area so the expanded
  // detail reads cleanly instead of being clipped above the fold.
  if (willOpen) {
    var scroll = item.parentNode;
    while (scroll && !(scroll.classList && scroll.classList.contains("wb-scroll"))) scroll = scroll.parentNode;
    if (scroll && scroll.getBoundingClientRect) {
      setTimeout(function(){
        try {
          var delta = item.getBoundingClientRect().top - scroll.getBoundingClientRect().top;
          if (Math.abs(delta) > 2) scroll.scrollBy({ top: delta, behavior: "smooth" });
        } catch (e) {}
      }, 60);
    }
  }
};
window.__warpRenderBookings = function(data) {
  var root = document.getElementById("__warp_bk_root");
  if (!root || !data || !Array.isArray(data.shipments)) return;
  var LOGO = '<svg viewBox="0 0 660 186" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="WARP"><path d="M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z" fill="currentColor"/><path d="M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z" fill="currentColor"/><path d="M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z" fill="currentColor"/><path d="M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z" fill="currentColor"/><path d="M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z" fill="currentColor"/><path d="M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z" fill="currentColor"/><path d="M292.04 76.1794H275.219V94.1557H292.04V76.1794Z" fill="currentColor"/><path d="M275.219 131.615H292.04V113.84H275.219V131.615Z" fill="currentColor"/></svg>';
  var ARROW = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
  var EXTLINK = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>';

  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[c];}); }
  function cityState(c,st){ var a=[]; if(c)a.push(c); if(st)a.push(st); return a.join(", "); }
  function fmtDate(s){ if(!s) return "--"; try{ return new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});}catch(e){return s;} }
  function fmtWin(from,to,tz){
    if(!from) return "";
    try {
      var z = tz || "UTC";
      var d1 = new Date(from);
      var day = d1.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",timeZone:z});
      var t1 = d1.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:z});
      var out = day + ", " + t1;
      if (to) { var t2 = new Date(to).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",timeZone:z}); out += " &#8211; " + t2; }
      return out;
    } catch(e){ return from; }
  }
  function statusClass(s){
    s = String(s||"").toLowerCase();
    if (!s) return "";
    if (s.indexOf("cancel")>=0 || s.indexOf("fail")>=0 || s.indexOf("exception")>=0) return "bad";
    if (s.indexOf("deliver")>=0 || s.indexOf("complete")>=0) return "ok";
    return "warn";
  }
  function freightLine(items){
    if (!items || !items.length) return "Freight on file";
    var totalQty = 0, unit = "", parts = [];
    items.forEach(function(it){ totalQty += (it.qty||0); unit = it.qty_unit || unit; });
    var label = totalQty + " " + (unit||"unit") + (totalQty===1?"":"s");
    parts.push(label);
    var first = items[0];
    if (first && first.weight_per_unit) parts.push(first.weight_per_unit + " " + (first.weight_unit||"lbs") + " ea");
    if (first && first.length) parts.push(first.length + "&#215;" + first.width + "&#215;" + first.height + " " + (first.size_unit||"in").toLowerCase());
    return parts.join(" &#183; ");
  }

  var SEP = ' &#183; ';
  var h = '<div class="wcard">';
  h += '<div class="wh-head"><span class="wh-logo">' + LOGO + '</span><span class="wh-ti">Shipments</span>' + FORKLIFT_SLOT + '</div>';
  var sub = data.shown + (data.total && data.total > data.shown ? ' of ' + data.total : '') + (data.shown===1?' shipment':' shipments') + SEP + 'newest first';
  h += '<div class="wh-sec"><div class="st">Your shipments</div><div class="ss">' + sub + '</div></div>';

  h += '<div class="wb-scroll">';
  data.shipments.forEach(function(s, idx){
    var lane = cityState(s.origin_city, s.origin_state) + ' &#8594; ' + cityState(s.dest_city, s.dest_state);
    if (lane === ' &#8594; ') lane = esc(s.origin_zip) + ' &#8594; ' + esc(s.dest_zip);
    var sc = statusClass(s.status);
    var statusPill = s.status ? '<span class="wb-pill ' + sc + '">' + esc(s.status) + '</span>' : '';
    var meta = esc(s.mode) + SEP + freightLine(s.freight) + SEP + 'booked ' + fmtDate(s.created);

    var delay = Math.min(idx, 12) * 35;
    h += '<div class="wb-item" id="__warp_bk_item_' + idx + '" style="animation-delay:' + delay + 'ms">';
    h += '<div class="wb-row" data-warp-idx="' + idx + '">';
    h += '<span class="wb-chev">' + ARROW + '</span>';
    h += '<div class="wb-main"><div class="wb-top"><span class="wb-num">' + esc(s.shipment_number || s.order_number) + '</span>' +
         '<span class="wb-pill mode">' + esc(s.mode) + '</span>' + statusPill + '</div>' +
         '<div class="wb-lane">' + lane + '</div>' +
         '<div class="wb-meta">' + meta + '</div></div>';
    h += '</div>'; // row

    // detail panel
    var p = s.pickup || {}, d = s.delivery || {};
    function partyCol(title, x){
      var html = '<div class="wb-col"><div class="wb-col-h">' + title + '</div>';
      var line1 = esc(x.street || x.name || '');
      var line2 = cityState(x.city, x.state); if (x.zip) line2 += ' ' + esc(x.zip);
      html += '<div class="wb-addr">' + (line1 ? line1 + '<br>' : '') + line2 + '</div>';
      if (x.contact_name || x.contact_phone) html += '<div class="wb-kv"><b>' + esc(x.contact_name||'') + '</b>' + (x.contact_phone? SEP + esc(x.contact_phone):'') + '</div>';
      var win = fmtWin(x.window_from, x.window_to, x.tz);
      if (win) html += '<div class="wb-kv">' + win + '</div>';
      html += '</div>';
      return html;
    }
    var det = '<div class="wb-detail"><div class="wb-detail-clip"><div class="wb-detail-inner">';
    det += '<div class="wb-cols">' + partyCol('Pickup', p) + partyCol('Delivery', d) + '</div>';
    if (s.freight && s.freight.length) {
      det += '<div class="wb-block"><div class="wb-col-h">Freight</div>';
      s.freight.forEach(function(it){
        var fl = (it.qty||0) + ' ' + (it.qty_unit||'unit') + ((it.qty===1)?'':'s');
        if (it.weight_per_unit) fl += SEP + it.weight_per_unit + ' ' + (it.weight_unit||'lbs') + ' ea';
        if (it.length) fl += SEP + it.length + '&#215;' + it.width + '&#215;' + it.height + ' ' + (it.size_unit||'in').toLowerCase();
        if (it.hazardous) fl += SEP + 'hazmat';
        det += '<div class="wb-freight-line">' + esc(it.name||'Item') + ' &#8212; ' + fl + '</div>';
      });
      det += '</div>';
    }
    det += '<div class="wb-refs">Order ' + esc(s.order_number||'--') + SEP + 'Shipment ' + esc(s.shipment_number||'--') + '</div>';
    det += '<div class="wb-actions">';
    if (s.tracking_url) det += '<a class="wb-track" href="' + esc(s.tracking_url) + '" data-warp-url="' + esc(s.tracking_url) + '" target="_blank" rel="noopener noreferrer">Track shipment ' + EXTLINK + '</a>';
    det += '<span class="wb-hint">Ask me to pull the BOL, POD, or invoice</span>';
    det += '</div>'; // actions
    det += '</div></div></div>'; // inner, clip, detail

    h += det;
    h += '</div>'; // item
  });
  h += '</div>'; // scroll

  h += '<div class="wm-foot">Click a shipment for details &#183; ask me to track, pull docs, or book another</div>';
  h += '</div>'; // card
  root.innerHTML = h;
  try { if (window.__warpForklift) window.__warpForklift(); } catch (e) {}

  // Delegated click handling (no inline onclick — robust against sandbox CSP that
  // blocks event-handler attributes). One listener on root handles Track + rows.
  root.addEventListener("click", function(ev){
    var t = ev.target;
    var row = null;
    while (t && t !== root) {
      if (t.classList && t.classList.contains("wb-track")) {
        // Open the tracking page via the host bridge (sandbox blocks plain anchors).
        var url = t.getAttribute("data-warp-url");
        if (url && window.__warpOpenLink) { ev.preventDefault(); window.__warpOpenLink(url); }
        return; // never toggle the row when Track is clicked
      }
      if (t.classList && t.classList.contains("wb-row")) { row = t; break; }
      t = t.parentNode;
    }
    if (!row) return;
    window.__warpToggleShipment(row.getAttribute("data-warp-idx"));
  });
};`;
const OPENAI_CLIENT_JS = `
(function() {
  // External-link opener for the Track button on the ChatGPT/Apps path.
  window.__warpOpenLink = function(url){
    try { if (window.openai && typeof window.openai.openExternal === "function") { window.openai.openExternal({ href: url }); return; } } catch (e) {}
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch (e) {}
  };
  function readData() {
    try {
      var o = (typeof window !== "undefined" && window.openai && window.openai.toolOutput && window.openai.toolOutput.structuredContent) || null;
      if (o) return o;
    } catch (e) {}
    try {
      var inline = document.getElementById("__warp_bk_data");
      if (inline && inline.textContent) return JSON.parse(inline.textContent);
    } catch (e) {}
    return null;
  }
  var data = readData();
  if (data) window.__warpRenderBookings(data);
})();`;
function buildHtml(opts) {
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<title>Warp Shipments</title>
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
// ChatGPT path, data embedded inline (used in tool-result content for embedded hosts).
export function renderBookingsCard(data) {
    const jsonScript = `<script id="__warp_bk_data" type="application/json">${escapeJsonForScript(JSON.stringify(data))}</script>`;
    return buildHtml({ clientScript: OPENAI_CLIENT_JS, dataScript: jsonScript });
}
// ChatGPT Apps SDK resource (bare template; structuredContent bound at render).
export function bookingsCardTemplate() {
    return buildHtml({ clientScript: OPENAI_CLIENT_JS });
}
// Claude / MCP Apps resource (bare template; data arrives via the postMessage
// bridge in the bundled App client, which calls window.__warpRenderBookings).
export function bookingsCardMcpTemplate() {
    return buildHtml({ clientScript: BOOKINGS_APP_CLIENT_BUNDLE });
}
export { MCP_APP_MIME_TYPE };
function escapeJsonForScript(s) {
    return s.replace(/<\/script/gi, "<\\/script").replace(/<script/gi, "<\\script");
}
//# sourceMappingURL=bookings-card.js.map