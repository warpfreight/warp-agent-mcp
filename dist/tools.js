import { z } from "zod";
import { WarpApiError, USER_AGENT } from "./client.js";
import { trackEvent, getCustomerEmail } from "./analytics.js";
import { checkCommodity, isCanadianPostal, coverageGapRefusal } from "./policy.js";
import { QUOTE_CARD_RESOURCE_URI, QUOTE_CARD_MCP_RESOURCE_URI, renderQuoteCard, toWidgetData, } from "./widgets/quote-card.js";
import { BOOKINGS_CARD_RESOURCE_URI, BOOKINGS_CARD_MCP_RESOURCE_URI, renderBookingsCard, toBookingsWidgetData, trackingUrl, } from "./widgets/bookings-card.js";
import { BATCH_QUOTE_CARD_RESOURCE_URI, BATCH_QUOTE_CARD_MCP_RESOURCE_URI, renderBatchQuoteCard, toBatchQuoteWidgetData, } from "./widgets/batch-quote-card.js";
import { BATCH_BOOK_CARD_RESOURCE_URI, BATCH_BOOK_CARD_MCP_RESOURCE_URI, renderBatchBookCard, toBatchBookWidgetData, } from "./widgets/batch-book-card.js";
// Claude / MCP Apps (SEP-1865) UI linkage. Goes on each quote tool DEFINITION
// (so the host knows to render the card) and on the result. ChatGPT ignores
// these and uses the openai/* keys instead; the two namespaces don't collide.
const UI_META = {
    ui: { resourceUri: QUOTE_CARD_MCP_RESOURCE_URI, visibility: ["model", "app"] },
    "ui/resourceUri": QUOTE_CARD_MCP_RESOURCE_URI,
};
// Wrap a quote-tool response so UI-capable clients render the inline quote card.
// Claude reads the inline text/html resource; ChatGPT Apps SDK reads
// _meta["openai/outputTemplate"] + structuredContent. Clients without UI ignore
// the resource and fall back to the text JSON — 100% backwards compatible.
function quoteToolResult(mode, input, data) {
    const widget = toWidgetData(mode, input, data);
    const content = [{ type: "text", text: JSON.stringify(data, null, 2) }];
    if (widget) {
        content.push({ type: "resource", resource: { uri: QUOTE_CARD_RESOURCE_URI, mimeType: "text/html", text: renderQuoteCard(widget) } });
    }
    const result = { content };
    if (widget) {
        result.structuredContent = widget;
        result._meta = { "openai/outputTemplate": QUOTE_CARD_RESOURCE_URI, "openai/widgetAccessible": true, "openai/resultCanProduceWidget": true, ...UI_META };
    }
    return result;
}
// MCP Apps UI linkage for the bookings/shipments card (list_bookings).
const BOOKINGS_UI_META = {
    ui: { resourceUri: BOOKINGS_CARD_MCP_RESOURCE_URI, visibility: ["model", "app"] },
    "ui/resourceUri": BOOKINGS_CARD_MCP_RESOURCE_URI,
};
// MCP Apps UI linkage for the batch-quote card (batch_quote).
const BATCH_QUOTE_UI_META = {
    ui: { resourceUri: BATCH_QUOTE_CARD_MCP_RESOURCE_URI, visibility: ["model", "app"] },
    "ui/resourceUri": BATCH_QUOTE_CARD_MCP_RESOURCE_URI,
};
// MCP Apps UI linkage for the batch-book progress card (batch_book).
const BATCH_BOOK_UI_META = {
    ui: { resourceUri: BATCH_BOOK_CARD_MCP_RESOURCE_URI, visibility: ["model", "app"] },
    "ui/resourceUri": BATCH_BOOK_CARD_MCP_RESOURCE_URI,
};
// Wrap a batch-book result so UI-capable clients render the single consolidated
// progress card (one row per booking, Booked/Failed pill, tracking link).
// Non-UI clients get the same data as JSON text.
function batchBookToolResult(rawRows) {
    const widget = toBatchBookWidgetData(rawRows);
    const textPayload = {
        total: rawRows.length,
        succeeded: rawRows.filter((r) => r.ok).length,
        failed: rawRows.filter((r) => !r.ok).length,
        rows: rawRows,
    };
    const content = [{ type: "text", text: JSON.stringify(textPayload, null, 2) }];
    if (widget) {
        content.push({ type: "resource", resource: { uri: BATCH_BOOK_CARD_RESOURCE_URI, mimeType: "text/html", text: renderBatchBookCard(widget) } });
    }
    const result = { content };
    if (widget) {
        result.structuredContent = widget;
        result._meta = { "openai/outputTemplate": BATCH_BOOK_CARD_RESOURCE_URI, "openai/widgetAccessible": true, "openai/resultCanProduceWidget": true, ...BATCH_BOOK_UI_META };
    }
    return result;
}
// Wrap a batch-quote result so UI-capable clients render the single consolidated
// card. Non-UI clients get the same data as JSON text.
function batchQuoteToolResult(rawLanes) {
    const widget = toBatchQuoteWidgetData(rawLanes);
    const textPayload = {
        total: rawLanes.length,
        succeeded: rawLanes.filter((r) => r.ok).length,
        failed: rawLanes.filter((r) => !r.ok).length,
        lanes: rawLanes,
    };
    const content = [{ type: "text", text: JSON.stringify(textPayload, null, 2) }];
    if (widget) {
        content.push({ type: "resource", resource: { uri: BATCH_QUOTE_CARD_RESOURCE_URI, mimeType: "text/html", text: renderBatchQuoteCard(widget) } });
    }
    const result = { content };
    if (widget) {
        result.structuredContent = widget;
        result._meta = { "openai/outputTemplate": BATCH_QUOTE_CARD_RESOURCE_URI, "openai/widgetAccessible": true, "openai/resultCanProduceWidget": true, ...BATCH_QUOTE_UI_META };
    }
    return result;
}
// Wrap list_bookings so UI-capable clients render the inline mini-TMS card.
// The text payload is enriched with a canonical `tracking_url` per shipment so
// the model never has to fabricate a tracking link (it had been guessing the
// wrong host). Non-UI clients fall back to that enriched JSON.
function bookingsToolResult(data) {
    const widget = toBookingsWidgetData(data);
    // Enrich the raw response: attach tracking_url (https://tracking.wearewarp.com/<shipmentNumber>)
    // to each shipment in the text output, without dropping any original fields.
    // Keyed on the S- shipment number (NOT the P- order number); fall back to
    // trackingNumber.
    let textPayload = data;
    const rows = Array.isArray(data.data)
        ? (data.data)
        : null;
    if (rows) {
        const enriched = rows.map((s) => ({
            ...s,
            tracking_url: trackingUrl(typeof s.shipmentNumber === "string" ? s.shipmentNumber
                : typeof s.trackingNumber === "string" ? s.trackingNumber : undefined),
        }));
        textPayload = { ...data, data: enriched };
    }
    const content = [{ type: "text", text: JSON.stringify(textPayload, null, 2) }];
    if (widget) {
        content.push({ type: "resource", resource: { uri: BOOKINGS_CARD_RESOURCE_URI, mimeType: "text/html", text: renderBookingsCard(widget) } });
    }
    const result = { content };
    if (widget) {
        result.structuredContent = widget;
        result._meta = { "openai/outputTemplate": BOOKINGS_CARD_RESOURCE_URI, "openai/widgetAccessible": true, "openai/resultCanProduceWidget": true, ...BOOKINGS_UI_META };
    }
    return result;
}
function errText(err) {
    if (err instanceof WarpApiError)
        return JSON.stringify(err.body, null, 2);
    if (err instanceof Error)
        return err.message;
    return String(err);
}
/**
 * Turn an upstream failure into a message that names the FIX, not just the
 * failure — the bar MISSING_DIMS set (it tells the agent exactly which fields
 * to send next, which is why it reads as good agent UX instead of a dead end).
 *
 * Every tool's catch block used to return errText() alone: a raw JSON dump of
 * the upstream body with no next step, so an agent's only move was to surface
 * the blob to the user or silently give up. This keeps that detail (nothing is
 * hidden) and appends exactly one concrete action, chosen from the upstream
 * status/code. Where the API already names what's wrong (MISSING_* carries
 * missing_fields) we point at it rather than restating it.
 */
function agentError(err) {
    const detail = errText(err);
    const status = err instanceof WarpApiError ? err.status : undefined;
    let body = err instanceof WarpApiError ? err.body : undefined;
    if (typeof body === "string") {
        try {
            body = JSON.parse(body);
        }
        catch { /* leave as text */ }
    }
    const code = typeof body?.code === "string"
        ? body.code
        : undefined;
    // Our fetches abort via AbortSignal.timeout(); node surfaces that as
    // TimeoutError/AbortError, which must read as "retry", never as "no coverage".
    const isTimeout = err instanceof Error
        && (err.name === "TimeoutError" || err.name === "AbortError" || /timeout|abort/i.test(err.message));
    let next;
    if (isTimeout) {
        next = "The upstream pricing service did not answer in time. Nothing was quoted, booked, or charged — retry the same call in a few seconds.";
    }
    else if (code && code.startsWith("MISSING_")) {
        next = "Send the fields named above (see missing_fields), then call this tool again.";
    }
    else if (code === "UPSTREAM_ERROR") {
        next = "Warp has no published rate for this lane in this mode. Call `compare_modes` to price every mode that can legally carry this load, or email support@wearewarp.com for a custom quote.";
    }
    else if (status === 401 || status === 403) {
        next = "The API key was rejected. Run `warp-agent login`, or set WARP_API_KEY to a wak_live_* / wak_test_* key. Note the quote tools work with no key at all — only booking and account tools need one.";
    }
    else if (status === 404) {
        next = "Not found. Quote and shipment ids rotate and expire — re-run the quote (or the lookup) and use the fresh id immediately.";
    }
    else if (status === 429) {
        next = "Rate limited. Wait a few seconds, then retry the same call unchanged.";
    }
    else if (typeof status === "number" && status >= 500) {
        next = "Warp's upstream service is temporarily unavailable. Nothing was booked or charged — retry in a few seconds.";
    }
    else if (status === 400) {
        next = "The request was rejected as invalid. Correct the field named above and call the tool again.";
    }
    else {
        next = "Retry the call once; if it keeps failing, email support@wearewarp.com and include this message.";
    }
    return `${detail}\n\nNext: ${next}`;
}
// Session-level cache: PRICING_xxx -> amount so book can log revenue
const quoteAmountCache = new Map();
function validateDate(date) {
    const [y, m, d] = date.split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (parsed.getFullYear() !== y || parsed.getMonth() !== m - 1 || parsed.getDate() !== d) {
        return `${date} is not a valid calendar date`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today)
        return `${date} is in the past`;
    return true;
}
// Log quotes to our DB so quote_history works across all surfaces
async function logQuote(apiKey, quoteId, originZip, destZip, mode, priceCents, pallets) {
    if (!apiKey || !quoteId)
        return;
    try {
        await fetch("https://www.wearewarp.com/api/v1/freight/quote-log", {
            method: "POST",
            headers: { "user-agent": USER_AGENT, "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ quoteId, originZip, destZip, mode, priceCents, pallets }),
        });
    }
    catch { /* non-fatal */ }
}
/* ── analytics helpers (ported from warp-site PR #3386) ───────────────────
   The /bookings payload is untyped and has changed shape before, so these
   read defensively: find the key that is actually there, and let the caller
   report honestly when none is. Guessing a field name and emitting 0 would
   turn "I could not tell" into "you spent nothing". */
function pickRows(raw) {
    if (Array.isArray(raw))
        return raw;
    if (raw && typeof raw === "object") {
        for (const key of ["bookings", "data", "results", "items", "shipments"]) {
            const v = raw[key];
            if (Array.isArray(v))
                return v;
        }
    }
    return [];
}
function firstKeyPresent(rows, candidates) {
    for (const key of candidates) {
        if (rows.some((r) => r[key] !== undefined && r[key] !== null && r[key] !== ""))
            return key;
    }
    return null;
}
function anToNumber(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    if (typeof v === "string") {
        const n = Number(v.replace(/[$,\s]/g, ""));
        if (Number.isFinite(n))
            return n;
    }
    return null;
}
function stringish(v) {
    if (typeof v === "string" && v.trim())
        return v.trim();
    if (typeof v === "number")
        return String(v);
    return null;
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
function tally(rows, key) {
    const out = {};
    for (const r of rows) {
        const k = stringish(r[key]);
        if (!k)
            continue;
        out[k] = (out[k] ?? 0) + 1;
    }
    return out;
}
export function registerTools(server, client, getApiKey) {
    // Called fresh on every tool invocation — picks up CLI login/signup without MCP restart
    const WARP_API_KEY = getApiKey;
    function tool(name, description, schema, annotationsOrHandler, maybeHandler) {
        const deprefixed = name.startsWith("warp_") ? name.slice("warp_".length) : name;
        const hasAnnotations = typeof annotationsOrHandler !== "function";
        const existingAnn = hasAnnotations ? annotationsOrHandler : undefined;
        const handler = (hasAnnotations ? maybeHandler : annotationsOrHandler);
        const title = existingAnn?.title ?? deprefixed;
        const annotations = { ...existingAnn, title };
        return server.registerTool(name, { title, description, inputSchema: schema, annotations }, handler);
    }
    // ── 1. van_quote ───────────────────────────────────────────
    const vanQuoteTool = tool("van_quote", "Quote a cargo van shipment (1-3 pallets, firm price, 15-min expiry)", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pallets: z.number().int().min(1).max(3).describe("Number of pallets (1-3)"),
        weight_lbs_per_pallet: z.number().min(50).max(3500).describe("Weight per pallet in lbs"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        commodity: z.string().optional().describe("Commodity description"),
        pickup_services: z.array(z.string()).optional().describe("Pickup accessorials: pickup-appointment, liftgate-pickup, residential-pickup, limited-access-pickup, inside-pickup, driver-assist-pickup"),
        delivery_services: z.array(z.string()).optional().describe("Delivery accessorials: delivery-appointment, liftgate-delivery, residential-delivery, limited-access-delivery, inside-delivery, driver-assist-delivery"),
    }, { title: "Get Cargo Van Quote", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            if (isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip)) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            const data = await client.vanQuote(params);
            // Cache all option amounts for booking
            const _vwid = data?.warp_quote_id;
            const _vwamt = data?.warp_price;
            if (_vwid && _vwamt)
                quoteAmountCache.set(_vwid, _vwamt);
            for (const _vo of (data?.options ?? [])) {
                if (_vo.id && _vo.rate)
                    quoteAmountCache.set(_vo.id, _vo.rate);
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_van_quote',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: 'van',
                duration_ms: Date.now() - start,
            });
            return quoteToolResult("van", params, data);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_van_quote',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 2. box_truck_quote ─────────────────────────────────────
    const boxTruckQuoteTool = tool("box_truck_quote", "Quote a 26' box truck shipment (1-12 pallets, firm price, 15-min expiry)", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pallets: z.number().int().min(1).max(12).describe("Number of pallets (1-12)"),
        weight_lbs_per_pallet: z.number().min(50).max(10000).describe("Weight per pallet in lbs"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        commodity: z.string().optional().describe("Commodity description"),
        pickup_services: z.array(z.string()).optional().describe("Pickup accessorials: pickup-appointment, liftgate-pickup, residential-pickup, limited-access-pickup, inside-pickup, driver-assist-pickup"),
        delivery_services: z.array(z.string()).optional().describe("Delivery accessorials: delivery-appointment, liftgate-delivery, residential-delivery, limited-access-delivery, inside-delivery, driver-assist-delivery"),
    }, { title: "Get Box Truck Quote", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            if (isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip)) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            const data = await client.boxTruckQuote(params);
            const _bwid = data?.warp_quote_id;
            const _bwamt = data?.warp_price;
            if (_bwid && _bwamt)
                quoteAmountCache.set(_bwid, _bwamt);
            for (const _bo of (data?.options ?? [])) {
                if (_bo.id && _bo.rate)
                    quoteAmountCache.set(_bo.id, _bo.rate);
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_box_truck_quote',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: 'box_truck',
                duration_ms: Date.now() - start,
            });
            return quoteToolResult("box-truck", params, data);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_box_truck_quote',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 3. ftl_quote ───────────────────────────────────────────
    const ftlQuoteTool = tool("ftl_quote", "Quote a full truckload (53' dry van). Only origin, destination, and date required.", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        pallets: z.number().int().min(1).max(26).optional().describe("Pallets (optional, display only)"),
        weight_lbs_per_pallet: z.number().min(50).max(5000).optional().describe("Weight per pallet (optional)"),
        commodity: z.string().optional().describe("Commodity description"),
    }, { title: "Get Full Truckload Quote", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const isCanadaLane = isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip);
            if (isCanadaLane) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            const data = await client.ftlQuote(params);
            const _fwid = data?.warp_quote_id;
            const _fwamt = data?.warp_price;
            if (_fwid && _fwamt)
                quoteAmountCache.set(_fwid, _fwamt);
            for (const _fo of (data?.options ?? [])) {
                if (_fo.id && _fo.rate)
                    quoteAmountCache.set(_fo.id, _fo.rate);
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_ftl_quote',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: 'ftl',
                duration_ms: Date.now() - start,
            });
            return quoteToolResult("ftl", params, data);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_ftl_quote',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 4. ltl_quote ───────────────────────────────────────────
    const ltlQuoteTool = tool("ltl_quote", "Quote an LTL shipment — returns Warp's all-inclusive rate FAST (~1-2s) so the user sees a price immediately. The inline quote card shows the Warp rate plus a 'finding other carrier rates…' loading indicator. IMMEDIATELY follow up by calling ltl_market_options with the same parameters to fill in the multi-carrier comparison (~15s). Provide dims + commodity for an exact firm quote; if you don't have dims, quote anyway — it assumes a standard 48x40x48 pallet (FAK, no freight class) for an instant price. Don't block on asking for pallet dimensions; quote first, then pass real dims for an exact rate. When a palletized load could also move by box truck or van, quote LTL alongside those and show the cheapest valid mode. Do not editorialize the results. Do not declare a winner or recommend a specific carrier. Present Warp's quote first, then list market options as context. Let the user decide.", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        pallets: z.number().int().min(1).max(26).optional().describe("Number of pallets"),
        weight_lbs_per_pallet: z.number().min(50).max(5000).optional().describe("Weight per pallet in lbs"),
        commodity: z.string().optional().describe("Commodity description"),
        length_in: z.number().positive().optional().describe("Pallet length in inches"),
        width_in: z.number().positive().optional().describe("Pallet width in inches"),
        height_in: z.number().positive().optional().describe("Pallet height in inches"),
        freight_class: z.string().optional().describe("Freight class (optional, FAK rates used if omitted)"),
        stackable: z.boolean().optional().describe("Whether pallets are stackable"),
        hazmat: z.boolean().optional().describe("Hazardous materials flag"),
        pickup_services: z.array(z.string()).optional().describe("Pickup accessorials: pickup-appointment, liftgate-pickup, residential-pickup, limited-access-pickup, inside-pickup, driver-assist-pickup"),
        delivery_services: z.array(z.string()).optional().describe("Delivery accessorials: delivery-appointment, liftgate-delivery, residential-delivery, limited-access-delivery, inside-delivery, driver-assist-delivery"),
    }, { title: "Get LTL Freight Quote", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            if (isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip)) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            const data = await client.ltlQuote(params, params.origin_zip, params.destination_zip);
            // Cache Warp quote amount
            const qid = data?.warp_quote_id;
            const qamt = data?.warp_price;
            if (qid && qamt) {
                quoteAmountCache.set(qid, qamt);
                // Log to our DB for quote history
                logQuote(WARP_API_KEY(), qid, params.origin_zip, params.destination_zip, 'LTL', Math.round(qamt * 100), params.pallets ?? 1);
            }
            // Cache all market option amounts so any carrier can be booked
            const options = data?.options ?? [];
            for (const opt of options) {
                const oid = opt.id;
                const orate = opt.rate;
                if (oid && orate)
                    quoteAmountCache.set(oid, orate);
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_ltl_quote',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: 'ltl',
                amount_usd: qamt,
                quote_id: qid,
                duration_ms: Date.now() - start,
            });
            return quoteToolResult("ltl", params, data);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_ltl_quote',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 4b. ltl_market_options ─────────────────────────────────
    // Follow-up to ltl_quote: fetches the 30+ carrier spread (~15s) AND
    // re-issues the Warp quote in parallel, then renders the same inline quote
    // card with the comparison filled in. Same input schema as ltl_quote.
    const ltlMarketOptionsTool = tool("ltl_market_options", "Multi-carrier LTL comparison — returns 30+ carrier rates ranked by price (slow, ~15s). Call IMMEDIATELY AFTER ltl_quote with the same parameters; this fills in the 'finding other carrier rates…' section the fast quote card was showing. Useful when the user wants to compare carriers or pick a specific one. Do not declare a winner or recommend a specific carrier; just present the ranked list.", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        pallets: z.number().int().min(1).max(26).optional().describe("Number of pallets"),
        weight_lbs_per_pallet: z.number().min(50).max(5000).optional().describe("Weight per pallet in lbs"),
        commodity: z.string().optional().describe("Commodity description"),
        length_in: z.number().positive().optional().describe("Pallet length in inches"),
        width_in: z.number().positive().optional().describe("Pallet width in inches"),
        height_in: z.number().positive().optional().describe("Pallet height in inches"),
        freight_class: z.string().optional().describe("Freight class (optional, FAK rates used if omitted)"),
        stackable: z.boolean().optional().describe("Whether pallets are stackable"),
        hazmat: z.boolean().optional().describe("Hazardous materials flag"),
        pickup_services: z.array(z.string()).optional().describe("Pickup accessorials: pickup-appointment, liftgate-pickup, residential-pickup, limited-access-pickup, inside-pickup, driver-assist-pickup"),
        delivery_services: z.array(z.string()).optional().describe("Delivery accessorials: delivery-appointment, liftgate-delivery, residential-delivery, limited-access-delivery, inside-delivery, driver-assist-delivery"),
    }, { title: "Compare LTL Carriers", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            if (isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip)) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            // Fire Warp quote + carrier spread in parallel. Total latency ≈ slow (~15s).
            const [warpRaw, marketOptions] = await Promise.all([
                client.ltlQuote(params, params.origin_zip, params.destination_zip).catch(() => ({})),
                client.ltlMarketOptions(params).catch(() => []),
            ]);
            // Cache Warp quote amount so book can log revenue
            const qid = warpRaw?.warp_quote_id;
            const qamt = warpRaw?.warp_price;
            if (qid && qamt)
                quoteAmountCache.set(qid, qamt);
            // Pin the spread's Warp row to the headline instant quote.
            // The fast /ltl/quote and the carrier spread price Warp through two
            // different upstreams, so the spread's Warp row can come back with a
            // different quote_id + price than the Warp rate the user just saw above.
            // Booking that row would then charge a price that doesn't match the
            // headline. We point the spread's Warp row at the SAME quote_id + price
            // as the headline quote, so "book the Warp option" always books exactly
            // the Warp price shown — one Warp price everywhere. Other carriers keep
            // their own per-row quote_id + price (they're genuinely separate rates).
            const opts = Array.isArray(marketOptions)
                ? marketOptions
                : [];
            for (const row of opts) {
                if (row && row.is_warp === true && qid) {
                    row.quote_id = qid;
                    if (typeof qamt === "number")
                        row.price_usd = qamt;
                }
                // Cache every bookable row's amount so book's session guard
                // passes (and revenue logs) when the user books a specific carrier,
                // not just the headline Warp quote.
                const rid = typeof row?.quote_id === "string" ? row.quote_id : undefined;
                const rprice = typeof row?.price_usd === "number" ? row.price_usd : undefined;
                if (rid && rprice)
                    quoteAmountCache.set(rid, rprice);
            }
            // Combine for the card: Warp featured + filled-in spread, loading flag cleared.
            const combined = {
                ...warpRaw,
                market_options: marketOptions,
                loading_market: false,
            };
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_ltl_market_options',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: 'ltl',
                amount_usd: qamt,
                quote_id: qid,
                duration_ms: Date.now() - start,
            });
            return quoteToolResult("ltl", params, combined);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_ltl_market_options',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // Advertise the Claude / MCP Apps UI resource on each quote tool definition so
    // the host renders the inline quote card. ChatGPT uses the result _meta instead.
    // Optional-chained: registerTools also runs with a stub server in tests whose
    // tool() returns no handle — there the update is simply a no-op.
    for (const t of [vanQuoteTool, boxTruckQuoteTool, ftlQuoteTool, ltlQuoteTool, ltlMarketOptionsTool]) {
        t?.update({ _meta: UI_META });
    }
    // ── 4d. compare_modes ────────────────────────────────────────────
    // The broker brain. One call that does the judgment a shipper pays a broker
    // for: decide which modes the load can legally ride, price every eligible one
    // IN PARALLEL, and return a single decision-complete recommendation with the
    // trade-off math already done.
    //
    // Why this exists as a tool and not as prompt guidance: the server
    // instructions ask the model to quote every plausible mode and compare them
    // itself. That is the most common and costly failure we see — the model picks
    // one mode, skips the cheaper one, and the shipper overpays. Encoding the
    // comparison server-side makes the right answer the DEFAULT instead of a
    // behavior we hope the host's model exhibits.
    //
    // Decision-complete from `structuredContent` alone — no HTML required — so a
    // text-only MCP host renders the same answer a widget host does.
    //
    // QUOTE-ONLY. This tool never books. It returns quote ids that a human can
    // confirm through `book`, exactly like every other quote tool.
    const MODE_LABELS = {
        "van": "Cargo van",
        "box-truck": "26' box truck",
        "ftl": "FTL (53' dry van)",
        "ltl": "LTL (shared)",
    };
    // Structural limits, copied from each single-mode tool's own input schema
    // above so eligibility can never drift from what the mode actually accepts.
    const MODE_LIMITS = {
        "van": { maxPallets: 3, maxWeightPerPallet: 3500 },
        "box-truck": { maxPallets: 12, maxWeightPerPallet: 10000 },
        "ftl": { maxPallets: 26, maxWeightPerPallet: 5000 },
        "ltl": { maxPallets: 26, maxWeightPerPallet: 5000 },
    };
    const usd = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    // Errors are agent UX: a mode that failed to price must read as a sentence the
    // agent can relay, not as an escaped JSON blob. Upstream hands us the reason in
    // a few shapes (WarpApiError.body as an object, as a JSON string, or plain
    // text) — dig out the human message and fall back gracefully.
    const upstreamReason = (err) => {
        let body = err instanceof WarpApiError ? err.body : err instanceof Error ? err.message : err;
        if (typeof body === "string") {
            const raw = body;
            try {
                body = JSON.parse(raw);
            }
            catch {
                return raw.slice(0, 160);
            }
        }
        if (body && typeof body === "object") {
            const rec = body;
            for (const k of ["error", "message", "detail", "_note"]) {
                if (typeof rec[k] === "string" && rec[k])
                    return rec[k].slice(0, 160);
            }
        }
        return String(body ?? "no rate returned").slice(0, 160);
    };
    tool("compare_modes", "THE ONE CALL for \"what's the cheapest/best way to ship this?\". Prices ALL FOUR freight modes (LTL / full truckload / cargo van / 26' box truck) in ONE keyless call to Warp's all-modes engine and returns a decision-complete recommendation: the winning mode, its rate, transit, a bookable quote_id, the trade-off math against the runner-up, and every mode that couldn't price (with the reason). Prefer this over calling the individual quote tools and comparing them yourself — one round trip, and modes Warp can't serve are returned as explicitly unavailable WITH the reason rather than being dropped, so there is never a silently shortened list to guess from. Dims are optional (a standard 48x40x48 pallet is assumed). Set benchmark_market:true to also rank Warp's rate against the live 30+ carrier market for the lane (adds ~15-25s) — that makes the answer decision-complete: the right mode AND whether the price is actually good. Quote-only: it never books. To book, pass the recommended quote_id to `book` after the user confirms.", {
        origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        pallets: z.number().int().min(1).max(26).describe("Number of pallets (1-26)"),
        weight_lbs_per_pallet: z.number().min(50).max(10000).describe("Weight per pallet in lbs"),
        commodity: z.string().optional().describe("Commodity description"),
        length_in: z.number().positive().optional().describe("Pallet length in inches (defaults to 48)"),
        width_in: z.number().positive().optional().describe("Pallet width in inches (defaults to 40)"),
        height_in: z.number().positive().optional().describe("Pallet height in inches (defaults to 48)"),
        freight_class: z.string().optional().describe("Freight class (optional, FAK rates used if omitted)"),
        stackable: z.boolean().optional().describe("Whether pallets are stackable"),
        hazmat: z.boolean().optional().describe("Hazardous materials flag"),
        pickup_services: z.array(z.string()).optional().describe("Pickup accessorials: pickup-appointment, liftgate-pickup, residential-pickup, limited-access-pickup, inside-pickup, driver-assist-pickup"),
        delivery_services: z.array(z.string()).optional().describe("Delivery accessorials: delivery-appointment, liftgate-delivery, residential-delivery, limited-access-delivery, inside-delivery, driver-assist-delivery"),
        priority: z.enum(["cheapest", "fastest"]).optional().describe("What to optimize the recommendation for. Defaults to 'cheapest'."),
        benchmark_market: z.boolean().optional().describe("Also benchmark Warp's rate against the live 30+ carrier LTL market for this lane. Makes the answer decision-complete (is this rate actually good?) but costs ~15-25s — the mode comparison alone returns in ~1-2s. Defaults to false."),
    }, { title: "Compare Freight Modes", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            if (isCanadianPostal(params.origin_zip) || isCanadianPostal(params.destination_zip)) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            // Same ambient/shelf-stable policy the booking path enforces — refuse
            // reefer freight before spending four upstream quote calls on it.
            const commodityIssue = checkCommodity(params.commodity);
            if (commodityIssue) {
                return { content: [{ type: "text", text: commodityIssue }], isError: true };
            }
            const priority = params.priority ?? "cheapest";
            const pallets = params.pallets;
            const weightPer = params.weight_lbs_per_pallet;
            const totalWeight = pallets * weightPer;
            // 1. ONE upstream call for all four modes. The all-modes route
            //    (POST /api/v1/quote) already fans out to the four mode handlers
            //    in-process and returns each one's price, transit, quote_tier,
            //    assumptions and missing_for_ship — so we wrap it rather than
            //    re-deriving any of that client-side. Optional lane benchmark runs
            //    CONCURRENTLY, so total latency is max(quote, spread), never the sum.
            const wantBenchmark = params.benchmark_market === true;
            const [allModes, marketRows] = await Promise.all([
                client.allModesQuote(params),
                wantBenchmark
                    ? client.ltlMarketOptions(params).catch(() => [])
                    : Promise.resolve([]),
            ]);
            // The route names modes cargo_van / box_truck; our labels and limits are
            // keyed by the MCP's QuoteMode vocabulary.
            const MODE_FROM_ROUTE = {
                ltl: "ltl", ftl: "ftl", cargo_van: "van", box_truck: "box-truck",
            };
            const priced = [];
            const unavailable = [];
            const results = Array.isArray(allModes.raw.results)
                ? allModes.raw.results
                : [];
            for (const row of results) {
                const mode = MODE_FROM_ROUTE[String(row.mode)];
                if (!mode)
                    continue;
                const label = MODE_LABELS[mode];
                const det = (row.details ?? {});
                const price = typeof row.price_usd === "number" ? row.price_usd : null;
                const quoteId = typeof row.quote_id === "string" ? row.quote_id : null;
                if (row.available !== true || price === null || !quoteId) {
                    // Unavailable modes are KEPT, never filtered out — an honest "not
                    // available" stops the model inventing a number for a mode we can't
                    // serve. Where the load structurally cannot ride the mode, say THAT
                    // instead of the route's generic "a rate has not yet been determined",
                    // which misreads as a coverage gap rather than a physical limit.
                    const lim = MODE_LIMITS[mode];
                    const physical = [];
                    if (pallets > lim.maxPallets)
                        physical.push(`holds ${lim.maxPallets} pallet${lim.maxPallets === 1 ? "" : "s"}, this load is ${pallets}`);
                    if (weightPer > lim.maxWeightPerPallet)
                        physical.push(`tops out at ${lim.maxWeightPerPallet.toLocaleString("en-US")} lb per pallet, this load is ${weightPer.toLocaleString("en-US")} lb`);
                    unavailable.push({
                        mode, mode_label: label,
                        reason: physical.length
                            ? `${label} ${physical.join("; ")} — it physically cannot carry this load, so no rate was requested.`
                            : `${label}: ${typeof row.reason === "string" && row.reason ? row.reason : "no rate available on this lane"}.`,
                    });
                    continue;
                }
                quoteAmountCache.set(quoteId, price);
                logQuote(WARP_API_KEY(), quoteId, params.origin_zip, params.destination_zip, mode.toUpperCase(), Math.round(price * 100), pallets);
                // A tier of "firm" is only trustworthy if the DIMS were the caller's.
                // We inject a standard pallet when they're omitted (otherwise the route
                // drops LTL entirely), and LTL prices off size — so downgrade and put
                // the assumed fields back on the missing list.
                const dimsMatter = mode === "ltl";
                const routeTier = typeof det.quote_tier === "string" ? det.quote_tier : null;
                const routeMissing = Array.isArray(det.missing_for_ship) ? det.missing_for_ship : [];
                priced.push({
                    mode, mode_label: label, price_usd: price,
                    transit_days: typeof row.transit_days === "number" ? row.transit_days : null,
                    delivery_date: typeof det.delivery_date === "string" ? det.delivery_date : null,
                    quote_id: quoteId,
                    expires_at: typeof det.expires_at === "string" ? det.expires_at : null,
                    booking_url: typeof det.booking_url === "string" ? det.booking_url : null,
                    quote_tier: allModes.dimsAssumed && dimsMatter ? "indicative" : routeTier,
                    missing_for_ship: allModes.dimsAssumed && dimsMatter
                        ? Array.from(new Set([...routeMissing, ...allModes.assumedDimFields]))
                        : routeMissing,
                });
            }
            // 3. Rank. Unknown transit sorts last on the "fastest" axis rather than
            //    pretending to be instant.
            const byPrice = (a, b) => a.price_usd - b.price_usd;
            const transitOf = (m) => m.transit_days ?? Number.POSITIVE_INFINITY;
            priced.sort(priority === "fastest"
                ? (a, b) => (transitOf(a) - transitOf(b)) || byPrice(a, b)
                : byPrice);
            if (!priced.length) {
                const why = unavailable.map((u) => `• ${u.reason}`).join("\n");
                return {
                    content: [{ type: "text", text: `No mode could be priced for ${params.origin_zip} → ${params.destination_zip} on ${params.pickup_date}.\n\n${why}\n\n${coverageGapRefusal(params.origin_zip, params.destination_zip)}` }],
                    structuredContent: {
                        lane: { origin_zip: params.origin_zip, destination_zip: params.destination_zip, pickup_date: params.pickup_date },
                        recommended: null, alternatives: [], unavailable,
                        priced_modes: 0, compared_modes: results.length, elapsed_ms: Date.now() - start,
                    },
                    isError: true,
                };
            }
            // 4. The trade-off math — the part a rate lookup can't give you. Compare
            //    the winner to the mode that beats it on the OTHER axis, and price
            //    the difference per day, so the answer is decision-complete.
            const winner = priced[0];
            const rest = priced.slice(1);
            let why;
            if (!rest.length) {
                why = `${winner.mode_label} is the only mode with live coverage for this load on this lane.`;
            }
            else if (priority === "fastest") {
                const cheapest = [...rest].sort(byPrice)[0];
                const premium = winner.price_usd - cheapest.price_usd;
                const daysSaved = transitOf(cheapest) - transitOf(winner);
                why = premium > 0 && Number.isFinite(daysSaved) && daysSaved > 0
                    ? `${winner.mode_label} is ${daysSaved} day${daysSaved === 1 ? "" : "s"} faster than ${cheapest.mode_label} for ${usd(premium)} more — ${usd(premium / daysSaved)} per day saved.`
                    : `${winner.mode_label} is the fastest option at ${usd(winner.price_usd)}.`;
            }
            else {
                const fastest = [...rest].sort((a, b) => transitOf(a) - transitOf(b))[0];
                const savings = fastest.price_usd - winner.price_usd;
                const daysSlower = transitOf(winner) - transitOf(fastest);
                why = savings > 0 && Number.isFinite(daysSlower) && daysSlower > 0
                    ? `${winner.mode_label} is ${usd(savings)} cheaper than ${fastest.mode_label} and ${daysSlower} day${daysSlower === 1 ? "" : "s"} slower — the ${fastest.mode_label} premium buys each day back at ${usd(savings / daysSlower)}.`
                    : savings > 0
                        ? `${winner.mode_label} is ${usd(savings)} cheaper than ${fastest.mode_label} with no transit penalty.`
                        : `${winner.mode_label} is the cheapest option at ${usd(winner.price_usd)}.`;
            }
            // Benchmark Warp's own rate against the live carrier market for this lane.
            // Reported straight, including when Warp is NOT the cheapest — an honest
            // benchmark is the whole point, and a rigged one dies the first time a
            // shipper checks it. LTL is the basis when priced (the spread is LTL
            // carriers); otherwise we benchmark the winner and say so.
            const ltlPriced = priced.find((p) => p.mode === "ltl");
            const basis = ltlPriced ?? winner;
            const competitors = marketRows
                .filter((o) => o && o.is_warp !== true && typeof o.price_usd === "number");
            let market_benchmark = null;
            if (wantBenchmark && competitors.length) {
                const prices = competitors.map((o) => o.price_usd).sort((a, b) => a - b);
                const cheapest = prices[0];
                const median = prices[Math.floor(prices.length / 2)];
                const cheapestRow = competitors.find((o) => o.price_usd === cheapest);
                const beating = prices.filter((p) => p < basis.price_usd).length;
                const round2 = (n) => Math.round(n * 100) / 100;
                market_benchmark = {
                    basis_mode: basis.mode,
                    warp_price_usd: basis.price_usd,
                    carriers_compared: competitors.length,
                    cheapest_competitor: typeof cheapestRow?.carrier_name === "string" ? cheapestRow.carrier_name : null,
                    cheapest_competitor_usd: cheapest,
                    median_competitor_usd: median,
                    carriers_cheaper_than_warp: beating,
                    vs_cheapest_usd: round2(cheapest - basis.price_usd),
                    vs_median_usd: round2(median - basis.price_usd),
                    verdict: beating === 0
                        ? `Warp is the cheapest of ${competitors.length + 1} rates priced on this lane, ${usd(cheapest - basis.price_usd)} below the next carrier (${typeof cheapestRow?.carrier_name === "string" ? cheapestRow.carrier_name : "unnamed"}) and ${usd(median - basis.price_usd)} below the market median.`
                        : `${beating} of ${competitors.length} carriers price below Warp on this lane (cheapest ${typeof cheapestRow?.carrier_name === "string" ? cheapestRow.carrier_name : "unnamed"} at ${usd(cheapest)}); Warp is ${usd(Math.abs(median - basis.price_usd))} ${median > basis.price_usd ? "below" : "above"} the market median.`,
                };
            }
            else if (wantBenchmark) {
                market_benchmark = { unavailable: "The carrier market sweep returned no comparable rates for this lane (it times out intermittently). The mode comparison above is unaffected — re-run to retry the benchmark." };
            }
            // Label the headline honestly. An indicative price priced on a pallet we
            // invented must never read like a settled number the customer can rely on.
            const indicative = winner.quote_tier === "indicative";
            // Disclosure is mode-specific: LTL prices off pallet size, the vehicle
            // modes don't. Show the WINNER's truth, never another mode's.
            const dimsDisclosure = !allModes.dimsAssumed
                ? ""
                : winner.mode === "ltl"
                    ? `Priced on an ASSUMED standard 48x40x48 in pallet — ${allModes.assumedDimFields.join(", ")} not provided. LTL price is driven by pallet size, especially HEIGHT: a taller pallet can cost several times more on the same lane. Treat this as indicative and send length_in/width_in/height_in for a firm price. (Without any dims the engine drops LTL entirely, so a standard pallet was assumed to keep it in the comparison.)`
                    : `Dimensions were assumed (standard 48x40x48 in pallet), but ${winner.mode_label} is priced per vehicle, so the rate does not change with pallet size.`;
            const summary = [
                `${winner.mode_label} — ${usd(winner.price_usd)}${winner.transit_days ? `, ${winner.transit_days} day${winner.transit_days === 1 ? "" : "s"}` : ""}${winner.delivery_date ? `, delivers ${winner.delivery_date}` : ""}${indicative ? "   [INDICATIVE — not a firm price]" : ""}`,
                dimsDisclosure,
                winner.missing_for_ship.length ? `Still needed for a firm price: ${winner.missing_for_ship.join(", ")}.` : "",
                why,
                market_benchmark && typeof market_benchmark.verdict === "string" ? `Market: ${market_benchmark.verdict}` : "",
                rest.length ? `Alternatives: ${rest.map((r) => `${r.mode_label} ${usd(r.price_usd)}${r.transit_days ? `/${r.transit_days}d` : ""}`).join(" · ")}` : "",
                // Carry the REASON into the text block, not just structuredContent.
                // Clients that render text-only otherwise saw "Not available: Cargo van"
                // with no why, which reads as a transient failure worth retrying instead
                // of a mode that cannot serve this lane.
                unavailable.length ? `Not available:\n${unavailable.map((u) => `• ${u.mode_label} — ${u.reason}`).join("\n")}` : "",
                `Quote id ${winner.quote_id} — booking requires explicit confirmation.`,
            ].filter(Boolean).join("\n");
            const structured = {
                lane: { origin_zip: params.origin_zip, destination_zip: params.destination_zip, pickup_date: params.pickup_date },
                load: {
                    pallets, weight_lbs_per_pallet: weightPer, total_weight_lbs: totalWeight,
                    dims_in: { length: params.length_in ?? 48, width: params.width_in ?? 40, height: params.height_in ?? 48 },
                    dims_assumed: params.length_in === undefined || params.width_in === undefined || params.height_in === undefined,
                    dims_disclosure: dimsDisclosure || null,
                    commodity: params.commodity ?? null,
                },
                quote_tier: winner.quote_tier,
                is_firm: winner.quote_tier === "firm",
                missing_for_firm_price: winner.missing_for_ship,
                // The upstream all-modes response, VERBATIM. The backlog's definition
                // of done requires this tool's output to match the reference endpoint's
                // shape, so `results[]` and `book` are passed through untouched
                // (every mode, including the unavailable ones, with the engine's own
                // details/assumptions/booking_url). The recommendation fields above are
                // additive on top — nothing upstream is reshaped or dropped.
                results: allModes.raw.results ?? [],
                book: allModes.raw.book ?? null,
                priority,
                recommended: { ...winner, why },
                alternatives: rest,
                unavailable,
                market_benchmark,
                priced_modes: priced.length,
                compared_modes: results.length,
                elapsed_ms: Date.now() - start,
                next_step: `To book, call \`book\` with quote_id "${winner.quote_id}" plus pickup and delivery addresses — only after the user explicitly confirms. This tool never books.`,
            };
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_compare_modes',
                success: true,
                origin_zip: params.origin_zip,
                dest_zip: params.destination_zip,
                mode: `compare:${winner.mode}`,
                amount_usd: winner.price_usd,
                quote_id: winner.quote_id,
                duration_ms: Date.now() - start,
            });
            return {
                content: [
                    { type: "text", text: summary },
                    { type: "text", text: JSON.stringify(structured, null, 2) },
                ],
                structuredContent: structured,
            };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_compare_modes',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 4c. batch_quote ─────────────────────────────────────────────
    // Price N lanes in ONE tool call so a spreadsheet (or any list of lanes)
    // renders as a single batch-quote card instead of N noisy per-lane calls.
    // Server fans out in parallel (concurrency cap = 8). Warp single rate only.
    const batchQuoteTool = tool("batch_quote", "Price MANY lanes in ONE call (parallel, ~1-3s for typical spreadsheets). Use this WHENEVER the user gives you a spreadsheet, CSV, or list of multiple lanes to quote — do NOT call warp_*_quote in a loop. Returns a single batch-quote card with one row per lane (origin → dest · mode · pallets · price · transit). Each priced lane keeps its quote_id and can be booked individually with book (\"book row 3\").", {
        lanes: z.array(z.object({
            mode: z.enum(["ltl", "ftl", "van", "box-truck"]).optional().describe("Mode for this lane. Defaults to 'ltl'."),
            origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
            destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP code"),
            pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Pickup date YYYY-MM-DD (must not be in the past)"),
            pallets: z.number().int().min(1).max(26).optional(),
            weight_lbs_per_pallet: z.number().min(50).max(5000).optional(),
            commodity: z.string().optional(),
            length_in: z.number().positive().optional(),
            width_in: z.number().positive().optional(),
            height_in: z.number().positive().optional(),
            freight_class: z.string().optional(),
            stackable: z.boolean().optional(),
            hazmat: z.boolean().optional(),
            pickup_services: z.array(z.string()).optional(),
            delivery_services: z.array(z.string()).optional(),
        })).min(1).max(50).describe("Array of lane requests (1-50). Each row maps to one quote."),
    }, { title: "Batch Quote Lanes", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const rawLanes = params.lanes;
            // Refuse Canadian zips up front (no need to burn quote calls on them).
            for (const lane of rawLanes) {
                const o = String(lane.origin_zip ?? "");
                const d = String(lane.destination_zip ?? "");
                if (isCanadianPostal(o) || isCanadianPostal(d)) {
                    return { content: [{ type: "text", text: "Warp only services US domestic shipments. Remove non-US lanes and try again." }], isError: true };
                }
            }
            const results = await client.batchQuote(rawLanes);
            // Cache each priced lane's quote_id → amount so book can log revenue.
            for (const r of results) {
                if (!r.ok || !r.result)
                    continue;
                const qid = r.result.warp_quote_id;
                const qamt = r.result.warp_price;
                if (qid && qamt)
                    quoteAmountCache.set(qid, qamt);
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_batch_quote',
                success: true,
                duration_ms: Date.now() - start,
            });
            return batchQuoteToolResult(results);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_batch_quote',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    batchQuoteTool?.update({ _meta: BATCH_QUOTE_UI_META });
    // ── 5. book ────────────────────────────────────────────────
    // IMPORTANT: pickup and delivery MUST be two distinct z.object() instances,
    // not a shared `addressSchema`. zod-to-json-schema deduplicates shared
    // instances into a $ref ("$ref": "#/properties/pickup"), and MCP clients /
    // LLM tool-calling frameworks that don't dereference $ref then send the
    // value as a bare string — which the server's Zod .object() validation
    // rejects with `Expected object, received string`. Inlining both fully
    // keeps the advertised JSON Schema and the runtime validation in sync.
    // (Reported by a Claude API user 2026-05; do not collapse these back into
    // one shared schema.)
    const pickupSchema = z.object({
        zipCode: z.string().describe("5-digit ZIP"),
        city: z.string().describe("City name"),
        state: z.string().describe("2-letter state code"),
        street: z.string().describe("Street address"),
        contactName: z.string().describe("Contact full name"),
        phone: z.string().describe("Phone number"),
        email: z.string().describe("Email address"),
        specialInstruction: z.string().optional().describe("Special instructions"),
    });
    const deliverySchema = z.object({
        zipCode: z.string().describe("5-digit ZIP"),
        city: z.string().describe("City name"),
        state: z.string().describe("2-letter state code"),
        street: z.string().describe("Street address"),
        contactName: z.string().describe("Contact full name"),
        phone: z.string().describe("Phone number"),
        // Consignee email is frequently unknown to the shipper, so it's optional
        // on delivery (unlike pickup, where it's required).
        email: z.string().optional().describe("Email address (optional — consignee email is often unknown)"),
        specialInstruction: z.string().optional().describe("Special instructions"),
    });
    tool("book", "Book a quoted shipment using any quote_id or option id returned from a quote tool (Warp or market carrier). Requires quote_id + pickup and delivery addresses. Auth required.", {
        quote_id: z.string().describe("Quote ID from warp_quote_id (Warp) or id field of any market option returned by a quote tool. Use the id from your MOST RECENT quote — market-option ids rotate on every quote call and stale ids are rejected."),
        pickup: pickupSchema.optional().describe("Pickup address. Required if no default shipper is saved on your account."),
        delivery: deliverySchema.optional().describe("Delivery address. Required if this lane has not been shipped before."),
        notes: z.string().optional().describe("Special instructions for the shipment"),
        reference: z.string().optional().describe("Your internal reference number"),
        accessorials: z.object({
            pickup: z.array(z.string()).optional().describe("Pickup accessorials: liftgate-pickup, residential-pickup, inside-pickup, limited-access-pickup, pickup-appointment"),
            delivery: z.array(z.string()).optional().describe("Delivery accessorials: liftgate-delivery, residential-delivery, inside-delivery, limited-access-delivery, delivery-appointment"),
        }).optional().describe("Pickup/delivery accessorial services. Should match the accessorials used when quoting."),
        pickup_window: z.object({ from: z.string(), to: z.string() }).optional().describe("Pickup time window, 24h HH:MM, e.g. { from: '08:00', to: '17:00' }. Defaults to a full business day if omitted."),
        delivery_window: z.object({ from: z.string(), to: z.string() }).optional().describe("Delivery time window, 24h HH:MM, e.g. { from: '09:00', to: '12:00' }. Defaults to a full business day if omitted."),
    }, { title: "Book Shipment", destructiveHint: true }, async (params) => {
        const start = Date.now();
        try {
            // No session-cache precondition on purpose. /api/v1/book resolves the
            // quote SERVER-side (`SELECT * FROM quote_cache WHERE quote_id = …`) and
            // enforces expiry, single-use, and idempotent replay itself, so any
            // quote id is bookable from any process. The old guard additionally
            // required the quote to sit in THIS process's memory, which is wrong on
            // the hosted remote: quote and book arrive as separate HTTP requests
            // that can land on different serverless instances, so a caller who had
            // just quoted correctly was told to re-quote. quoteAmountCache is now
            // only an amount-display optimization (see amount_usd below); a miss
            // costs the "$X charged" line, never the booking.
            const apiKey = WARP_API_KEY();
            if (!apiKey) {
                return { content: [{ type: "text", text: "Booking requires your own Warp account with a card on file. Quoting is free and needs no key, but booking charges your card, so you need to sign in first. New to Warp? Sign up free at https://www.wearewarp.com/agents/account, then run 'warp-agent signup'. Already have an account? Run 'warp-agent login'." }], isError: true };
            }
            // /api/v1/book is atomic: Stripe charge + gw booking in one call.
            // No separate charge-me step needed; payment is handled server-side.
            const body = {
                quote_id: params.quote_id,
                ...(params.pickup ? { pickup: params.pickup } : {}),
                ...(params.delivery ? { delivery: params.delivery } : {}),
                ...(params.notes ? { notes: params.notes } : {}),
                ...(params.reference ? { reference: params.reference } : {}),
                ...(params.accessorials ? { accessorials: params.accessorials } : {}),
                ...(params.pickup_window ? { pickup_window: params.pickup_window } : {}),
                ...(params.delivery_window ? { delivery_window: params.delivery_window } : {}),
            };
            let data;
            try {
                data = await client.book(body);
            }
            catch (bookErr) {
                const m = errText(bookErr);
                const stale = /quote.*expired|quote.*not valid|quote.*superseded|quoteId is not valid/i.test(m);
                const noCard = /no payment|payment method|card on file|402/i.test(m);
                const reason = noCard
                    ? `No payment method on file. Add a card at https://www.wearewarp.com/agents/account then try again.`
                    : stale
                        ? `Booking failed: the quote has expired. Re-quote and book again immediately with a fresh id.`
                        : `Booking failed: ${m}`;
                return { content: [{ type: "text", text: reason }], isError: true };
            }
            const p = params.pickup;
            const d = params.delivery;
            const amount_usd = quoteAmountCache.get(params.quote_id);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'book',
                tool_name: 'warp_book',
                success: true,
                tracking_number: data?.trackingNumber,
                order_id: data?.orderId,
                quote_id: params.quote_id,
                amount_usd,
                origin_zip: p?.zipCode,
                dest_zip: d?.zipCode,
                customer_id: getCustomerEmail(),
                customer_name: getCustomerEmail(),
                duration_ms: Date.now() - start,
            });
            // Enrich the book response with the canonical public tracking URL so the
            // model surfaces the real deep link (https://tracking.wearewarp.com/S-…)
            // instead of the generic dashboard. The S- shipment number is the
            // tracking key; the P- order_number is shown for reconciliation only.
            const bookShipmentNo = (typeof data.shipment_number === "string" && data.shipment_number) ||
                (typeof data.tracking_number === "string" && data.tracking_number) || "";
            // Surface the exact price charged so the agent states it plainly and the
            // user can match it to their dashboard. /api/v1/book charges the stored
            // price of the quote_id booked (no re-quote), so this IS the final
            // amount — same number that appears on the shipment.
            const bookedPrice = (typeof data.price_usd === "number" && data.price_usd) ||
                (typeof data.amount_usd === "number" && data.amount_usd) ||
                amount_usd;
            const enriched = {
                ...data,
                ...(bookShipmentNo ? { tracking_url: trackingUrl(bookShipmentNo) } : {}),
                ...(typeof bookedPrice === "number"
                    ? {
                        booked_price_usd: bookedPrice,
                        price_note: "This is the final amount charged for the option you booked — it matches your shipment on the Warp dashboard.",
                    }
                    : {}),
            };
            return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_book',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 5b. batch_book ─────────────────────────────────────────
    // Book N already-quoted lanes in ONE tool call so a full spreadsheet of
    // priced lanes books as a single progress card instead of N noisy per-row
    // book calls. Sequential under the hood (every call charges a real
    // card; a 402 stops the run so the user fixes the card once instead of
    // seeing the same error N times). Same auth + same per-quote session-cache
    // guard as book.
    const batchBookTool = tool("batch_book", "Book MANY already-quoted lanes in ONE call (sequential, one card charge per row). Use this after batch_quote when the user says \"book all of them\" or \"book rows 1, 3, 5\" — do NOT call book in a loop. Each row needs a quote_id (the same one batch_quote returned for that row). Pickup/delivery default to the shared addresses at the top level so a single warehouse → many destinations only needs one address pair. Returns a progress card showing per-row Booked/Failed status with tracking numbers.", {
        bookings: z.array(z.object({
            quote_id: z.string().describe("Quote ID from a previous quote tool. Must be from THIS session — quote ids expire and rotate, so quote → book back-to-back."),
            pickup: z.object({
                zipCode: z.string(), city: z.string(), state: z.string(), street: z.string(),
                contactName: z.string(), phone: z.string(), email: z.string(),
                specialInstruction: z.string().optional(),
            }).optional().describe("Per-row pickup. Omit to inherit from shared_pickup."),
            delivery: z.object({
                zipCode: z.string(), city: z.string(), state: z.string(), street: z.string(),
                contactName: z.string(), phone: z.string(),
                email: z.string().optional(),
                specialInstruction: z.string().optional(),
            }).optional().describe("Per-row delivery. Omit to inherit from shared_delivery."),
            reference: z.string().optional().describe("Per-row reference (PO #, order #). Falls back to shared_reference."),
            notes: z.string().optional().describe("Per-row special instructions. Falls back to shared_notes."),
            accessorials: z.object({
                pickup: z.array(z.string()).optional(),
                delivery: z.array(z.string()).optional(),
            }).optional().describe("Per-row accessorials. Falls back to shared_accessorials."),
            pickup_window: z.object({ from: z.string(), to: z.string() }).optional(),
            delivery_window: z.object({ from: z.string(), to: z.string() }).optional(),
        })).min(1).max(25).describe("Array of bookings to confirm (1-25). Each is one freight shipment, one card charge."),
        shared_pickup: z.object({
            zipCode: z.string(), city: z.string(), state: z.string(), street: z.string(),
            contactName: z.string(), phone: z.string(), email: z.string(),
            specialInstruction: z.string().optional(),
        }).optional().describe("Pickup address applied to every row that doesn't supply its own (FBA case: one warehouse → many destinations)."),
        shared_delivery: z.object({
            zipCode: z.string(), city: z.string(), state: z.string(), street: z.string(),
            contactName: z.string(), phone: z.string(),
            email: z.string().optional(),
            specialInstruction: z.string().optional(),
        }).optional().describe("Delivery address applied to every row that doesn't supply its own. Uncommon (usually each row goes somewhere different)."),
        shared_reference: z.string().optional().describe("Reference applied to every row without its own."),
        shared_notes: z.string().optional().describe("Notes applied to every row without their own."),
        shared_accessorials: z.object({
            pickup: z.array(z.string()).optional(),
            delivery: z.array(z.string()).optional(),
        }).optional(),
        shared_pickup_window: z.object({ from: z.string(), to: z.string() }).optional(),
        shared_delivery_window: z.object({ from: z.string(), to: z.string() }).optional(),
    }, { title: "Batch Book Shipments", destructiveHint: true }, async (params) => {
        const start = Date.now();
        try {
            const apiKey = WARP_API_KEY();
            if (!apiKey) {
                return { content: [{ type: "text", text: "Booking requires your own Warp account with a card on file. Quoting is free; booking charges your card. Run `warp-agent signup` (new) or `warp-agent login` (existing)." }], isError: true };
            }
            const rows = params.bookings;
            // No session-cache precondition (see `book` above): /api/v1/book resolves
            // and expiry-checks each quote id server-side, so requiring the ids to be
            // in THIS process's memory only broke legitimate bookings whose quote
            // landed on a different serverless instance. Rows with genuinely stale or
            // unknown ids come back as per-row failures from the batch call, which is
            // the honest per-row outcome rather than failing the whole batch on a
            // cache miss. Still no money moves for a row that fails.
            //
            // Missing ids are worth catching locally, though — that's a caller bug,
            // not a stale quote, and it costs nothing to say so precisely.
            const blank = rows
                .map((r, i) => ({ i, qid: String(r.quote_id ?? "") }))
                .filter(({ qid }) => !qid);
            if (blank.length > 0) {
                const sample = blank.slice(0, 3).map((u) => `row ${u.i + 1}`).join(", ");
                return { content: [{ type: "text", text: `Cannot book: ${blank.length} of ${rows.length} rows have no quote_id (${sample}${blank.length > 3 ? ", …" : ""}). Every row needs the quote_id returned by batch_quote.` }], isError: true };
            }
            // Every row needs an effective pickup + delivery (per-row OR shared).
            // Validate up front so we don't charge row 1 then crash on row 2.
            const sharedPickup = params.shared_pickup;
            const sharedDelivery = params.shared_delivery;
            const missing = rows
                .map((r, i) => ({ i, hasPickup: !!(r.pickup ?? sharedPickup), hasDelivery: !!(r.delivery ?? sharedDelivery) }))
                .filter((m) => !m.hasPickup || !m.hasDelivery);
            if (missing.length > 0) {
                const which = missing.slice(0, 3).map((m) => `row ${m.i + 1} (${[!m.hasPickup && "pickup", !m.hasDelivery && "delivery"].filter(Boolean).join(" + ")})`).join(", ");
                return { content: [{ type: "text", text: `Cannot book: ${missing.length} of ${rows.length} rows are missing addresses (${which}${missing.length > 3 ? ", …" : ""}). Either set shared_pickup / shared_delivery for the common warehouse, or fill in per-row pickup/delivery for those rows.` }], isError: true };
            }
            const shared = {
                pickup: sharedPickup,
                delivery: sharedDelivery,
                notes: params.shared_notes,
                reference: params.shared_reference,
                accessorials: params.shared_accessorials,
                pickup_window: params.shared_pickup_window,
                delivery_window: params.shared_delivery_window,
            };
            const results = await client.batchBook(rows, shared);
            // Backfill amount_usd from the per-quote cache so the card can show
            // "$3,420 charged" without depending on the gw response carrying it.
            for (const r of results) {
                if (r.ok && r.amount_usd == null) {
                    const cached = quoteAmountCache.get(r.quote_id);
                    if (cached)
                        r.amount_usd = cached;
                }
            }
            const succeeded = results.filter((r) => r.ok).length;
            const totalAmount = results.reduce((s, r) => s + (r.ok ? (r.amount_usd ?? 0) : 0), 0);
            // Emit one event per successful booking (analytics still tracks per-shipment
            // revenue), plus one summary event for the batch itself.
            for (const r of results) {
                if (!r.ok)
                    continue;
                trackEvent({
                    product: 'warp-agent',
                    source: 'mcp',
                    event_type: 'book',
                    tool_name: 'warp_batch_book',
                    success: true,
                    tracking_number: r.tracking_number,
                    order_id: r.order_id,
                    quote_id: r.quote_id,
                    amount_usd: r.amount_usd,
                    origin_zip: r.pickup_zip,
                    dest_zip: r.delivery_zip,
                    customer_id: getCustomerEmail(),
                    customer_name: getCustomerEmail(),
                });
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'list',
                tool_name: 'warp_batch_book',
                success: succeeded === results.length,
                amount_usd: totalAmount,
                duration_ms: Date.now() - start,
            });
            return batchBookToolResult(results);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_batch_book',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    batchBookTool?.update({ _meta: BATCH_BOOK_UI_META });
    // ── 5c. multistop_quote ────────────────────────────────────
    // One truck, one route, multiple stops. Removed in 0.5.68 (sparse
    // coverage), re-added in 0.14.0 against the canonical public endpoints
    // (POST /api/v1/multistop/{quote,book} — /api/v1/openapi.json,
    // operationIds multistopQuote/multistopBook). Coverage is still
    // route-dependent: un-priced routes answer "A rate has not yet been
    // determined", surfaced below as a clean no-coverage message.
    // Session cache so multistop_book can validate stop_index against the
    // quoted stop sequence and fail fast on stale/foreign quote ids — same
    // pattern as quoteAmountCache for single-stop booking.
    const multistopRouteCache = new Map();
    tool("multistop_quote", "Quote a multi-stop FTL route: ONE truck visits 3+ stops in order (first pickup → intermediate stops → final delivery). Use for milk runs, pool distribution, or multi-store replenishment on a single truck — for a simple A→B truckload use ftl_quote. Auth required (free account). Coverage is route-dependent — not every route has a rate yet.", {
        pickup_zip: z.string().regex(/^\d{5}$/).describe("5-digit ZIP of the first pickup stop"),
        stop_zips: z.array(z.string().regex(/^\d{5}$/)).min(1).max(10).describe("5-digit ZIPs of the intermediate stops, in route order (at least 1)"),
        delivery_zip: z.string().regex(/^\d{5}$/).describe("5-digit ZIP of the final delivery stop"),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => validateDate(d) === true, (d) => ({ message: validateDate(d) })).describe("Pickup date YYYY-MM-DD"),
        pallets: z.number().int().min(1).max(26).optional().describe("Total pallets riding the route (default 1)"),
        total_weight_lbs: z.number().min(50).max(44000).optional().describe("Total weight across all freight in lbs (default 500 per pallet)"),
        vehicle_type: z.string().optional().describe("Vehicle code (default DRY_VAN_53)"),
        commodity: z.string().optional().describe("Commodity description"),
    }, { title: "Get Multi-stop FTL Quote", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const zips = [params.pickup_zip, ...params.stop_zips, params.delivery_zip];
            if (zips.some((zip) => isCanadianPostal(zip))) {
                return { content: [{ type: "text", text: "Warp only services US domestic shipments. International shipping is not available." }], isError: true };
            }
            const commodityIssue = checkCommodity(params.commodity);
            if (commodityIssue) {
                return { content: [{ type: "text", text: commodityIssue }], isError: true };
            }
            const apiKey = WARP_API_KEY();
            if (!apiKey) {
                return { content: [{ type: "text", text: "Multi-stop quoting requires a Warp account key (the route prices against your account, unlike single-stop quotes). Signing up is free: https://www.wearewarp.com/agents/account then run 'warp-agent signup'. Already have an account? Run 'warp-agent login'." }], isError: true };
            }
            const data = await client.multistopQuote(params);
            const inner = (data?.data && typeof data.data === "object" && !Array.isArray(data.data)
                ? data.data : data);
            const quoteId = (inner.quote_id ?? inner.quoteId);
            const totalCharge = (inner.total_charge ?? inner.totalCharge);
            if (!quoteId) {
                trackEvent({
                    product: 'warp-agent',
                    source: 'mcp',
                    event_type: 'quote',
                    tool_name: 'warp_multistop_quote',
                    success: false,
                    origin_zip: params.pickup_zip,
                    dest_zip: params.delivery_zip,
                    mode: 'multistop_ftl',
                    duration_ms: Date.now() - start,
                });
                return { content: [{ type: "text", text: `No multi-stop rate on this route yet (${zips.join(" → ")}). Multi-stop FTL coverage is route-dependent and still growing — a Warp rep can price it manually: support@wearewarp.com. Raw response: ${JSON.stringify(inner)}` }] };
            }
            multistopRouteCache.set(quoteId, { stops: zips, totalCharge });
            logQuote(apiKey, quoteId, params.pickup_zip, params.delivery_zip, "multistop", typeof totalCharge === "number" ? Math.round(totalCharge * 100) : null, params.pallets ?? 1);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_multistop_quote',
                success: true,
                origin_zip: params.pickup_zip,
                dest_zip: params.delivery_zip,
                mode: 'multistop_ftl',
                quote_id: quoteId,
                amount_usd: totalCharge,
                duration_ms: Date.now() - start,
            });
            const enriched = {
                ...inner,
                stop_sequence: zips.map((zip, i) => ({
                    stop_index: i,
                    zipcode: zip,
                    role: i === 0 ? "pickup" : i === zips.length - 1 ? "delivery" : "transit",
                })),
                _note: `Multi-stop quote ${quoteId}${typeof totalCharge === "number" ? ` — $${totalCharge}` : ""}. To book, call multistop_book with one shipments[] leg per pickup→delivery pair, each leg's stop_index referencing the stop_sequence above.`,
            };
            return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
        }
        catch (err) {
            const msg = errText(err);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_multistop_quote',
                success: false,
                error_message: msg,
                duration_ms: Date.now() - start,
            });
            if (/rate has not (yet )?been determined/i.test(msg)) {
                return { content: [{ type: "text", text: `No multi-stop rate on this route yet. Multi-stop FTL coverage is route-dependent and still growing — a Warp rep can price it manually: support@wearewarp.com.` }] };
            }
            return { content: [{ type: "text", text: msg }], isError: true };
        }
    });
    // ── 5d. multistop_book ─────────────────────────────────────
    const multistopStopSchema = z.object({
        stop_index: z.number().int().min(0).describe("Index into the quoted stop sequence: 0 = first pickup, then intermediate stops in order, last = final delivery. multistop_quote echoes the sequence as stop_sequence."),
        address: z.object({
            street: z.string().describe("Street address"),
            city: z.string().describe("City name"),
            state: z.string().describe("2-letter state code"),
            zipcode: z.string().describe("5-digit ZIP — must match the quoted stop's ZIP"),
        }).describe("Full address of this stop"),
        window_time: z.object({
            from: z.string().describe("Window open, ISO date-time, e.g. 2026-06-22T08:00:00.000Z"),
            to: z.string().describe("Window close, ISO date-time, e.g. 2026-06-22T23:59:59.000Z"),
        }).describe("Arrival window for this stop"),
        contact_name: z.string().optional().describe("Contact full name"),
        contact_phone: z.string().optional().describe("Contact phone"),
        contact_email: z.string().optional().describe("Contact email"),
    });
    const multistopLegItemSchema = z.object({
        name: z.string().optional().describe("Item label"),
        quantity: z.number().int().min(1).describe("Piece count"),
        packaging: z.string().optional().describe("e.g. pallet"),
        total_weight: z.number().describe("Total weight across the quantity in lbs (not per piece)"),
        weight_unit: z.string().optional().describe("Defaults to lbs"),
        length: z.number().optional().describe("Inches"),
        width: z.number().optional().describe("Inches"),
        height: z.number().optional().describe("Inches"),
        size_unit: z.string().optional().describe("Defaults to IN"),
        stackable: z.boolean().optional(),
    });
    tool("multistop_book", "Book a multi-stop FTL route quoted by multistop_quote. Send one shipments[] leg per pickup→delivery pair riding the truck (minimum 2 legs), each leg referencing the quoted stop sequence by stop_index with full address + arrival window. No card charge fires from this call — multi-stop pricing settles via your Warp account. Auth required.", {
        quote_id: z.string().describe("Quote ID from multistop_quote (PRICING_MULTI_…). Use the id from your MOST RECENT quote — ids expire and rotate."),
        shipments: z.array(z.object({
            pickup_info: multistopStopSchema.describe("Where this leg's freight gets picked up"),
            delivery_info: multistopStopSchema.describe("Where this leg's freight gets dropped"),
            list_items: z.array(multistopLegItemSchema).min(1).describe("Freight riding this leg"),
        })).min(2).max(20).describe("One leg per pickup→delivery pair (the gateway requires at least 2)"),
    }, { title: "Book Multi-stop FTL", destructiveHint: true }, async (params) => {
        const start = Date.now();
        try {
            const apiKey = WARP_API_KEY();
            if (!apiKey) {
                return { content: [{ type: "text", text: "Booking requires your own Warp account. New to Warp? Sign up free at https://www.wearewarp.com/agents/account, then run 'warp-agent signup'. Already have an account? Run 'warp-agent login'." }], isError: true };
            }
            const quoteId = params.quote_id;
            // This session-cache requirement STAYS, unlike the ones on `book` and
            // `batch_book` that were removed. Those only asked "did I see this id?",
            // which the server already answers. This cache holds the quoted STOP
            // SEQUENCE, and it is the only thing that can validate the caller's
            // stop_index values (below) — there is no server-side equivalent. Booking
            // a leg against an unvalidated index can send a truck to the wrong stops,
            // which is far worse than asking for a re-quote. On the hosted remote a
            // route quoted on another instance will miss here; that is the accepted
            // trade until an endpoint exists to fetch a multistop route by id.
            const cached = multistopRouteCache.get(quoteId);
            if (!cached) {
                return { content: [{ type: "text", text: `Cannot book: no multi-stop quote found for ${quoteId} in this session. Run multistop_quote in this same conversation, then book the id it returns — the stop sequence from that quote is what validates your stop_index values.` }], isError: true };
            }
            // stop_index sanity against the quoted sequence — catches an
            // off-by-one before the gateway books the wrong stops. Freight can
            // only ride forward, so each leg's pickup index must precede its
            // delivery index.
            const maxIndex = cached.stops.length - 1;
            const legs = params.shipments;
            const badLeg = legs.findIndex((leg) => leg.pickup_info.stop_index > maxIndex ||
                leg.delivery_info.stop_index > maxIndex ||
                leg.pickup_info.stop_index >= leg.delivery_info.stop_index);
            if (badLeg !== -1) {
                return { content: [{ type: "text", text: `Cannot book: shipments[${badLeg}] has an invalid stop_index. The quoted route has ${cached.stops.length} stops (0..${maxIndex}: ${cached.stops.join(" → ")}); each leg needs pickup_info.stop_index < delivery_info.stop_index within that range.` }], isError: true };
            }
            let data;
            try {
                data = await client.multistopBook(params);
            }
            catch (bookErr) {
                const m = errText(bookErr);
                const stale = /quote.*expired|quote.*not valid|quote.*superseded|quoteId is not valid/i.test(m);
                const reason = stale
                    ? `Booking failed: the quote has expired. Re-run multistop_quote and book again immediately with the fresh id.`
                    : `Booking failed: ${m}`;
                return { content: [{ type: "text", text: reason }], isError: true };
            }
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'book',
                tool_name: 'warp_multistop_book',
                success: true,
                quote_id: quoteId,
                amount_usd: cached.totalCharge,
                origin_zip: cached.stops[0],
                dest_zip: cached.stops[maxIndex],
                mode: 'multistop_ftl',
                customer_id: getCustomerEmail(),
                customer_name: getCustomerEmail(),
                duration_ms: Date.now() - start,
            });
            const enriched = {
                ...data,
                ...(typeof cached.totalCharge === "number"
                    ? {
                        booked_price_usd: cached.totalCharge,
                        price_note: "Multi-stop pricing settles via your Warp account — no card was charged by this call.",
                    }
                    : {}),
            };
            return { content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_multistop_book',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 6. track ───────────────────────────────────────────────
    tool("track", "Track a shipment by ID or tracking number. Auth required.", {
        shipment_id: z.string().describe("Shipment ID or tracking number (e.g. S-12345-2616)"),
    }, { title: "Track Shipment", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.track(params.shipment_id);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'track',
                tool_name: 'warp_track',
                success: true,
                tracking_number: params.shipment_id,
                duration_ms: Date.now() - start,
            });
            // Enrich with the canonical public tracking URL so the model links to the
            // real tracking page (https://tracking.wearewarp.com/<shipmentNumber>)
            // instead of fabricating one. The tracking page keys on the S- shipment
            // number (NOT the P- order number); fall back to trackingNumber.
            const records = Array.isArray(data) ? data : null;
            const out = records
                ? records.map((r) => ({
                    ...r,
                    tracking_url: trackingUrl(typeof r.shipmentNumber === "string" ? r.shipmentNumber
                        : typeof r.trackingNumber === "string" ? r.trackingNumber : undefined),
                }))
                : data;
            // An id-scoped lookup that comes back EMPTY is not "no updates yet" — it
            // means nothing matched that id. Returning a bare [] made the agent tell
            // the customer their freight simply had no activity, which is the wrong
            // answer to "where's my freight" and hides a typo'd or wrong-type id.
            if (records && records.length === 0) {
                return {
                    content: [{
                            type: "text",
                            text: `No shipment found for id "${params.shipment_id}" — so there is no tracking to report (this is NOT "no updates yet").\n\nNext: check the id and retry. Tracking keys on the S- shipment number or the P- order number; call \`list_bookings\` to get the exact ids on this account.`,
                        }],
                    isError: true,
                };
            }
            return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_track',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 8. lane_history ────────────────────────────────────────
    tool("lane_history", "Get shipping history for your lanes (past shipments, last consignee, counts). Auth required.", {}, { title: "View Lane History", readOnlyHint: true }, async () => {
        const start = Date.now();
        try {
            const data = await client.laneHistory();
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'list',
                tool_name: 'warp_lane_history',
                success: true,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_lane_history',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 9. list_bookings ───────────────────────────────────────
    const listBookingsTool = tool("list_bookings", "List recent bookings for this API key, newest first. Auth required. Renders an interactive shipments card (click a shipment to expand pickup/delivery, freight, and a tracking link).", {
        limit: z.number().int().min(1).max(100).optional().describe("Max bookings to return (default 25, max 100)"),
    }, { title: "List Bookings", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.listBookings(params.limit);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'list',
                tool_name: 'warp_list_bookings',
                success: true,
                duration_ms: Date.now() - start,
            });
            return bookingsToolResult(data);
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_list_bookings',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // Advertise the Claude / MCP Apps shipments card on the tool definition.
    listBookingsTool?.update({ _meta: BOOKINGS_UI_META });
    // ── 11. status ─────────────────────────────────────────────
    tool("status", "Check Warp API health and version. Also validates your API key if one is configured.", {}, { title: "Check API Status", readOnlyHint: true }, async () => {
        const start = Date.now();
        try {
            // Hit www.wearewarp.com/api/v1/version (not gw) — gw requires different auth on /version
            const res = await fetch("https://www.wearewarp.com/api/v1/version", { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
            const version = await res.json();
            // Validate API key by hitting a gw endpoint that requires auth
            let keyStatus = null;
            try {
                keyStatus = await client.laneHistory();
                keyStatus = { valid: true };
            }
            catch (err) {
                if (err instanceof WarpApiError && err.status === 401) {
                    keyStatus = { valid: false, error: err.body };
                }
            }
            const result = { ...version, key: keyStatus };
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'other',
                tool_name: 'warp_status',
                success: true,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_status',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 12. events ─────────────────────────────────────────────
    tool("events", "Get the full tracking event history for a shipment (timeline of pickups, in-transit updates, deliveries). Auth required.", {
        shipment_id: z.string().describe("Shipment ID from book response"),
    }, { title: "Get Shipment Events", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.events(params.shipment_id);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'events',
                tool_name: 'warp_events',
                success: true,
                tracking_number: params.shipment_id,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_events',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 13. get_invoice ────────────────────────────────────────
    tool("get_invoice", "Retrieve the invoice for a delivered shipment (line items, taxes, payment status). Auth required.", {
        order_id: z.string().describe("Order ID (typically the same as shipment_id)"),
    }, { title: "Get Invoice", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.invoice(params.order_id);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'invoice',
                tool_name: 'warp_get_invoice',
                success: true,
                order_id: params.order_id,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_get_invoice',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 14. get_documents ──────────────────────────────────────
    tool("get_documents", "List shipment documents (BOL, POD, customs forms, etc.). Returns download URLs. Auth required. To fetch the Bill of Lading, pass document_type='bol' — this is how EXTERNAL / brokered (market-carrier) BOLs are returned now, not just Warp-carrier ones.", {
        order_id: z.string().describe("Order ID (typically the same as shipment_id)"),
        document_type: z.string().optional().describe("Filter to one document type. Common: 'bol' (Bill of Lading — required for external/market carrier BOLs), 'pod' (proof of delivery). Omit to list all documents."),
    }, { title: "Get Shipment Documents", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.documents(params.order_id, params.document_type);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'documents',
                tool_name: 'warp_get_documents',
                success: true,
                order_id: params.order_id,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_get_documents',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── 15. quote_history ──────────────────────────────────────────────────────
    tool("quote_history", "List your recent freight quotes (LTL, van, box truck, FTL) from all sessions. Useful for surfacing prior pricing on similar lanes. Auth required.", {}, { title: "View Quote History", readOnlyHint: true }, async () => {
        const start = Date.now();
        try {
            const res = await fetch("https://www.wearewarp.com/api/v1/freight/quote-log", {
                headers: { "user-agent": USER_AGENT, "Authorization": `Bearer ${WARP_API_KEY() ?? ""}` },
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'list', tool_name: 'warp_quote_history', success: true, duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: JSON.stringify(data.quotes, null, 2) }] };
        }
        catch (err) {
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'error', tool_name: 'warp_quote_history', success: false, error_message: errText(err), duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: `Quote history unavailable: ${errText(err)}` }], isError: true };
        }
    });
    // ── login ────────────────────────────────────────────────
    tool("login", "Log in to Warp with email and password. Saves credentials locally so booking tools work. Call this if the user needs to authenticate or if payment_status says no key is configured.", {
        email: z.string().email().describe("Warp account email"),
        password: z.string().min(1).describe("Warp account password"),
    }, 
    // Anthropic's connector gate requires every tool to carry the applicable
    // readOnlyHint or destructiveHint. login is neither read-only (it writes
    // credentials to ~/.warp/config.json) nor destructive (it destroys nothing
    // and is undone by logging in again), so both are declared explicitly —
    // MCP treats an ABSENT destructiveHint as true, which would wrongly flag
    // signing in as a dangerous operation.
    { title: "Log In to Warp", readOnlyHint: false, destructiveHint: false }, async (params) => {
        try {
            const CUSTOMER_URL = "https://customer.wearewarp.com";
            const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
            const headers = { "user-agent": USER_AGENT, "Content-Type": "application/json", "app": `4;0.1.362;${ts}`, "Origin": CUSTOMER_URL };
            // Step 1: Login via customer portal to get JWT
            const authRes = await fetch(`${CUSTOMER_URL}/api/auth/login`, {
                method: "POST", headers,
                body: JSON.stringify({ email: params.email, password: params.password }),
                signal: AbortSignal.timeout(10000),
            });
            if (!authRes.ok) {
                return { content: [{ type: "text", text: "Login failed: Invalid email or password." }], isError: true };
            }
            const authData = await authRes.json();
            const accessToken = authData.accessToken;
            if (!accessToken) {
                return { content: [{ type: "text", text: "Login failed: No access token returned." }], isError: true };
            }
            // Step 2: Fetch raw Warp API key (same as CLI does)
            const keyRes = await fetch(`${CUSTOMER_URL}/api/developer/apikey`, {
                headers: { ...headers, "Authorization": `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(10000),
            });
            let rawKey = null;
            if (keyRes.ok) {
                const kd = await keyRes.json();
                rawKey = kd.value ?? null;
            }
            if (!rawKey) {
                // Try to generate one
                await fetch(`${CUSTOMER_URL}/api/developer/apikey`, { method: "POST", headers: { ...headers, "Authorization": `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
                await new Promise(r => setTimeout(r, 1000));
                const retry = await fetch(`${CUSTOMER_URL}/api/developer/apikey`, { headers: { ...headers, "Authorization": `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) });
                if (retry.ok) {
                    const rd = await retry.json();
                    rawKey = rd.value ?? null;
                }
            }
            if (!rawKey) {
                return { content: [{ type: "text", text: "Logged in but could not retrieve API key. Visit customer.wearewarp.com/dashboard/developer to generate one." }], isError: true };
            }
            // Step 3: Save raw key to ~/.warp/config.json
            const { writeFileSync, mkdirSync } = await import("fs");
            const { join } = await import("path");
            const { homedir } = await import("os");
            const dir = join(homedir(), ".warp");
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, "config.json"), JSON.stringify({ api_key: rawKey, email: params.email }, null, 2));
            // Step 4: Check payment status
            const meRes = await fetch("https://www.wearewarp.com/api/v1/agents/me", {
                headers: { "user-agent": USER_AGENT, "Authorization": `Bearer ${rawKey}`, "Content-Type": "application/json" },
                signal: AbortSignal.timeout(5000),
            });
            let hasCard = false;
            if (meRes.ok) {
                const me = await meRes.json();
                hasCard = !!me.has_card;
            }
            const status = hasCard
                ? "Payment method on file. Ready to book."
                : "No payment method on file. Add a card at https://www.wearewarp.com/agents/account to enable booking.";
            return { content: [{ type: "text", text: `Logged in as ${params.email}. ${status}` }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: `Login error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
        }
    });
    // ── consolidate ──────────────────────────────────────────────
    // The money-finder: same-lane loads inside a pickup window priced as one
    // truck vs separate LTLs. All clustering + pricing is server-side; both
    // sides of every comparison come back as bookable quote ids, so acting on
    // a proposal is a normal `book` call. Loads that can't consolidate return
    // with the REASON — relay it, never hide it.
    tool("consolidate", "Find consolidation savings across 2-12 upcoming loads: clusters loads sharing an origin+destination zip whose pickup dates fall within window_days (default 3) that together fit one 53' dry van, then prices each cluster BOTH ways — one combined FTL vs the sum of per-load LTLs — through real quotes with bookable quote ids. Use when the user has several loads to ship this week, asks if anything can ride together, or wants to cut freight spend. Loads that can't consolidate come back with the reason (no lane partner / outside window / exceeds trailer / cluster full) — relay reasons honestly. A truck pricing above its LTLs is shown with recommended:false; don't hide it. To act on a proposal, call `book` with the consolidated truck's quote_id. Auth optional — works keyless like the quote tools.", {
        loads: z.array(z.object({
            origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit origin ZIP"),
            destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit destination ZIP"),
            pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD"),
            pallets: z.number().int().min(1).max(26),
            weight_lbs_per_pallet: z.number().int().min(50).max(5000),
            ref: z.string().max(64).optional().describe("Your reference (PO number, order id) — echoed back"),
            length: z.number().optional().describe("Pallet length in inches (real dims firm up LTL pricing)"),
            width: z.number().optional(),
            height: z.number().optional().describe("Pallet height in inches — LTL prices off height above all"),
        })).min(2).max(12).describe("The loads you plan to ship"),
        window_days: z.number().int().min(1).max(7).optional().describe("Loads picking up within this many days of each other may ride together (default 3)"),
    }, { title: "Find Consolidation Savings", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.consolidate(params);
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'quote',
                tool_name: 'warp_consolidate',
                success: true,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_consolidate',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── shipper_profile ──────────────────────────────────────────
    // Context, never permission: the profile shapes what the agent should
    // SUGGEST (usual lane, standard dims, always-needed liftgate), and nothing
    // in it gates what the agent may do — limits live in spend policy,
    // read-only. The derived half aggregates the account's own quotes and
    // bookings server-side and cannot be written.
    tool("shipper_profile", "Read how this account actually ships — top lanes with ship counts, typical pallet count, usual pickup weekday, recent booked spend (derived server-side from the account's own quotes and bookings) plus explicit owner-set preferences: default accessorials, preferred mode, standard pallet dims, max transit days. READ THIS BEFORE asking the user questions it already answers: pre-fill their usual lane, apply their standard dims, include the liftgate they always need. Pass set_preferences to update the explicit half (merge-partial; allowlisted keys only; null clears a key). This profile is CONTEXT, NEVER PERMISSION — it never authorizes anything; spending limits live in spend policy and are read-only. Auth required.", {
        set_preferences: z.object({
            default_accessorials: z.object({
                pickup: z.array(z.string()).optional(),
                delivery: z.array(z.string()).optional(),
            }).optional().describe("Accessorial slugs to apply by default, e.g. liftgate-delivery"),
            preferred_mode: z.enum(["ltl", "ftl", "van", "box_truck", "cheapest"]).optional(),
            standard_pallet_dims: z.object({
                length: z.number().int().min(12).max(96),
                width: z.number().int().min(12).max(96),
                height: z.number().int().min(12).max(96),
            }).optional().describe("This shipper's standard pallet, inches"),
            max_transit_days: z.number().int().min(1).max(14).optional(),
            notes: z.string().max(500).optional(),
        }).optional().describe("Omit to read. Provide to merge-update the explicit preferences."),
    }, 
    // Not readOnlyHint: set_preferences writes (a merge-update of explicit
    // preferences — never limits, which have no write path anywhere).
    { title: "Shipper Profile" }, async ({ set_preferences }) => {
        const start = Date.now();
        try {
            const data = set_preferences
                ? await client.setShipperPreferences(set_preferences)
                : await client.getShipperProfile();
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: set_preferences ? 'other' : 'list',
                tool_name: 'warp_shipper_profile',
                success: true,
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({
                product: 'warp-agent',
                source: 'mcp',
                event_type: 'error',
                tool_name: 'warp_shipper_profile',
                success: false,
                error_message: errText(err),
                duration_ms: Date.now() - start,
            });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── automate_lane / manage_automation / automation_receipts ──
    // Recurring lane automation (standing orders). The safety contract these
    // descriptions state is enforced server-side, not here: proposing books
    // nothing until the OWNER approves from email, and the agent-side manage
    // surface is stop-only. Never promise activation from chat.
    tool("automate_lane", "Set up a RECURRING weekly shipment (standing order): describe the lane once, and after the account owner approves by email, Warp re-quotes it fresh every week and books the best option automatically while the price stays at or under the owner's ceiling. Over-ceiling weeks book nothing and notify the owner. THIS TOOL ONLY PROPOSES — nothing books now, and nothing ever books without the owner's one-time email approval. Auth required.", {
        weekday: z.number().int().min(0).max(6).describe("Pickup day each week: 0=Sunday … 6=Saturday"),
        ceiling_usd: z.number().positive().max(100000).describe("Max auto-booked price per shipment in USD; above this the week books nothing and the owner is emailed"),
        criteria: z.enum(["lowest_price", "fastest_transit"]).optional().describe("How to pick the winning option each week (default lowest_price)"),
        label: z.string().max(80).optional().describe("Human-readable lane label for the owner's emails, e.g. 'Ontario CA → Dallas TX, 6 pallets'"),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Optional YYYY-MM-DD; the automation retires itself after the last pickup on or before this date"),
        quote: z.object({
            origin_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP"),
            destination_zip: z.string().regex(/^\d{5}$/).describe("5-digit US ZIP"),
            pallets: z.number().int().min(1).describe("Pallet count"),
            weight_lbs_per_pallet: z.number().positive().describe("Weight per pallet in lbs"),
        }).passthrough().describe("Lane payload re-quoted each run — same fields as the quote tools (add length_in/width_in/height_in and commodity for firm LTL pricing). pickup_date is set automatically each week"),
        book: z.record(z.unknown()).describe("Booking payload used each run — same shape as the book tool's pickup/delivery addresses and contacts (patch.pickup, patch.delivery). quote_id and reference are set automatically each run"),
    }, { title: "Automate a Recurring Lane" }, async (params) => {
        const start = Date.now();
        try {
            const body = {
                weekday: params.weekday,
                ceiling_usd: params.ceiling_usd,
                criteria: params.criteria ?? "lowest_price",
                quote: params.quote,
                book: params.book,
            };
            if (params.label)
                body.label = params.label;
            if (params.end_date)
                body.end_date = params.end_date;
            const data = await client.proposeAutomation(body);
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'book', tool_name: 'warp_automate_lane', success: true, duration_ms: Date.now() - start });
            const auto = (data.automation ?? {});
            return { content: [{ type: "text", text: `Automation PROPOSED — not yet active. The account owner has been emailed an approval link; nothing books until they approve, and Warp never activates an automation from chat.\n\n` +
                            JSON.stringify(data, null, 2) +
                            `\n\nNext: tell the user to check the account owner's inbox. Poll with \`manage_automation\` action "status" and token "${String(auto.token ?? "")}".` }] };
        }
        catch (err) {
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'error', tool_name: 'warp_automate_lane', success: false, error_message: errText(err), duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    tool("manage_automation", "Check or stop a recurring lane automation. Actions: 'status' (read-only), 'pause', 'cancel' (permanent), 'skip_next' (skip one week's pickup — nothing books or charges that week). STOP-ONLY by design: there is no agent-side resume, reactivate, or ceiling change — those exist only behind the account owner's emailed approval link. Auth required.", {
        token: z.string().describe("automation token from automate_lane (so_…)"),
        action: z.enum(["status", "pause", "cancel", "skip_next"]).describe("status is read-only; pause/cancel/skip_next stop or shrink the automation"),
    }, { title: "Manage an Automation" }, async (params) => {
        const start = Date.now();
        try {
            const data = params.action === "status"
                ? await client.automationStatus(params.token)
                : await client.manageAutomation(params.token, params.action);
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'other', tool_name: 'warp_manage_automation', success: true, duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'error', tool_name: 'warp_manage_automation', success: false, error_message: errText(err), duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    tool("automation_receipts", "Authorization record for an automation's bookings: one entry per booking attempt showing the checks it passed at commit time against the owner's approval — same lane, price within ceiling, automation active, quote live — plus the shipment id it produced. Entries marked confirmation_required did NOT book autonomously; they fell back to owner confirmation. Read-only. Auth required.", {
        token: z.string().describe("automation token from automate_lane (so_…)"),
    }, { title: "Automation Authorization Record", readOnlyHint: true }, async (params) => {
        const start = Date.now();
        try {
            const data = await client.automationReceipts(params.token);
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'list', tool_name: 'warp_automation_receipts', success: true, duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            trackEvent({ product: 'warp-agent', source: 'mcp', event_type: 'error', tool_name: 'warp_automation_receipts', success: false, error_message: errText(err), duration_ms: Date.now() - start });
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── payment_status ───────────────────────────────────────
    tool("payment_status", "Check if the current Warp account has a payment method on file. Call this if the user asks about their payment status, or before booking if you want to confirm they can book. Returns has_card and onboard_url if a card needs to be added.", {}, { title: "Check Payment Status", readOnlyHint: true }, async () => {
        // Use the session API key passed to registerTools — never read from env/disk
        const apiKey = WARP_API_KEY();
        if (!apiKey) {
            return { content: [{ type: "text", text: "No API key found. The user needs to run warp-agent login first." }], isError: true };
        }
        try {
            const res = await fetch("https://www.wearewarp.com/api/v1/agents/me", {
                headers: { "user-agent": USER_AGENT, "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) {
                return { content: [{ type: "text", text: `Could not check payment status (${res.status}). The user can try booking — they will be prompted to add a card if needed.` }] };
            }
            const data = await res.json();
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch {
            return { content: [{ type: "text", text: "Could not reach payment status endpoint. The user can try booking — they will be prompted to add a card if needed." }] };
        }
    });
    // ── analytics ─────────────────────────────────────────
    tool("analytics", "Summarise your own shipping history: how many shipments, what you spent, and the split by mode, status and lane over a window. Aggregates the same bookings `list_bookings` returns, so an agent gets the answer in one call instead of pulling the list and adding it up. Auth required.", {
        limit: z.number().int().min(1).max(500).optional().describe("How many of your most recent bookings to summarise (default 100, max 500)"),
        group_by: z.enum(["mode", "status", "lane"]).optional().describe("Which breakdown to lead with. All three are returned regardless; this only orders the response."),
    }, { title: "Summarise Shipping History", readOnlyHint: true }, async (params) => {
        const apiKey = WARP_API_KEY();
        if (!apiKey) {
            return { content: [{ type: "text", text: "No API key found. Connect your Warp account to this connector (or run warp-agent login for the local install)." }], isError: true };
        }
        try {
            const raw = await client.listBookings(params.limit ?? 100);
            const rows = pickRows(raw);
            // Nothing to summarise is a real answer, not an error.
            if (rows.length === 0) {
                return { content: [{ type: "text", text: JSON.stringify({ shipments: 0, note: "No bookings found on this account for the requested window." }, null, 2) }] };
            }
            // Every metric is derived from keys PROVED present on the rows rather
            // than assumed. A metric we cannot compute is reported as unavailable
            // with the reason — never as a zero, which would read as "you spent
            // nothing" instead of "I could not tell".
            const spendKey = firstKeyPresent(rows, ["amount_usd", "total_usd", "price_usd", "amount", "total", "price"]);
            const modeKey = firstKeyPresent(rows, ["mode", "service_mode", "equipment", "service"]);
            const statusKey = firstKeyPresent(rows, ["status", "state", "shipment_status"]);
            const originKey = firstKeyPresent(rows, ["origin_zip", "origin", "from_zip", "pickup_zip"]);
            const destKey = firstKeyPresent(rows, ["destination_zip", "destination", "to_zip", "dropoff_zip"]);
            const dateKey = firstKeyPresent(rows, ["created_at", "booked_at", "pickup_date", "date"]);
            const unavailable = [];
            const summary = { shipments: rows.length };
            if (spendKey) {
                const amounts = rows.map((r) => anToNumber(r[spendKey])).filter((n) => n !== null);
                if (amounts.length > 0) {
                    const total = amounts.reduce((a, b) => a + b, 0);
                    summary.spend = {
                        total: round2(total),
                        average_per_shipment: round2(total / amounts.length),
                        largest: round2(Math.max(...amounts)),
                        smallest: round2(Math.min(...amounts)),
                        counted: amounts.length,
                        ...(amounts.length < rows.length
                            ? { note: `${rows.length - amounts.length} booking(s) had no readable amount and are excluded from spend.` }
                            : {}),
                        source_field: spendKey,
                    };
                }
                else {
                    unavailable.push(`spend — field "${spendKey}" is present but held no numeric values`);
                }
            }
            else {
                unavailable.push("spend — no amount field on these bookings");
            }
            if (modeKey)
                summary.by_mode = tally(rows, modeKey);
            else
                unavailable.push("by_mode — no mode field on these bookings");
            if (statusKey)
                summary.by_status = tally(rows, statusKey);
            else
                unavailable.push("by_status — no status field on these bookings");
            if (originKey && destKey) {
                const lanes = new Map();
                for (const r of rows) {
                    const o = stringish(r[originKey]);
                    const d = stringish(r[destKey]);
                    if (!o || !d)
                        continue;
                    const k = `${o} -> ${d}`;
                    lanes.set(k, (lanes.get(k) ?? 0) + 1);
                }
                if (lanes.size > 0) {
                    summary.top_lanes = [...lanes.entries()]
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 5)
                        .map(([lane, shipments]) => ({ lane, shipments }));
                    summary.distinct_lanes = lanes.size;
                }
                else {
                    unavailable.push("top_lanes — origin/destination fields were present but empty");
                }
            }
            else {
                unavailable.push("top_lanes — no origin/destination fields on these bookings");
            }
            if (dateKey) {
                const times = rows
                    .map((r) => Date.parse(String(r[dateKey] ?? "")))
                    .filter((t) => Number.isFinite(t));
                if (times.length > 0) {
                    summary.window = {
                        earliest: new Date(Math.min(...times)).toISOString().slice(0, 10),
                        latest: new Date(Math.max(...times)).toISOString().slice(0, 10),
                        source_field: dateKey,
                    };
                }
            }
            if (unavailable.length > 0)
                summary.unavailable = unavailable;
            summary.basis = `Aggregated from your ${rows.length} most recent booking(s) via /bookings. Figures cover those bookings only, not your whole account history.`;
            const ordered = params.group_by === "status"
                ? { shipments: summary.shipments, by_status: summary.by_status, ...summary }
                : params.group_by === "lane"
                    ? { shipments: summary.shipments, top_lanes: summary.top_lanes, ...summary }
                    : summary;
            return { content: [{ type: "text", text: JSON.stringify(ordered, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── locations ─────────────────────────────────────────
    tool("locations", "List the agent's saved pickup/delivery locations (addresses Warp has on file for this account), so you can reuse them when booking instead of re-typing addresses. Auth required.", {}, { title: "List Saved Locations", readOnlyHint: true }, async () => {
        try {
            const data = await client.getLocations();
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── load_templates ────────────────────────────────────
    tool("load_templates", "List the agent's saved load templates — reusable shipment configs (name, dims, weight, commodity). Recall one to quote/book a repeat kind of load without re-entering details. Auth required.", {}, { title: "List Load Templates", readOnlyHint: true }, async () => {
        try {
            const data = await client.getLoadTemplates();
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── save_load_template ────────────────────────────────
    tool("save_load_template", "Save a reusable load template (a named shipment config) so it can be recalled for repeat lanes. Auth required.", {
        name: z.string().describe("Friendly name, e.g. 'Standard 2-pallet LA load'"),
        weight_lbs: z.number().min(1).describe("Total weight in lbs"),
        length_in: z.number().min(1).describe("Length in inches"),
        width_in: z.number().min(1).describe("Width in inches"),
        height_in: z.number().min(1).describe("Height in inches"),
        commodity: z.string().optional().describe("Commodity description"),
        freight_class: z.string().optional().describe("Freight class (optional; FAK pricing if omitted)"),
        stackable: z.boolean().optional().describe("Whether the freight is stackable"),
        hazmat: z.boolean().optional().describe("Whether the freight is hazmat"),
    }, 
    // Creates a named template: a write, so not read-only, but purely additive
    // and separately removable via delete_load_template, so not destructive.
    // Declared explicitly for the same reason as login above.
    { title: "Save Load Template", readOnlyHint: false, destructiveHint: false }, async (params) => {
        try {
            const data = await client.saveLoadTemplate(params);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
    // ── delete_load_template ──────────────────────────────
    tool("delete_load_template", "Delete a saved load template by its id (starts with lt_). Auth required.", {
        load_template_id: z.string().describe("Template id to delete (starts with lt_)"),
    }, { title: "Delete Load Template", destructiveHint: true }, async (params) => {
        try {
            await client.deleteLoadTemplate(params.load_template_id);
            return { content: [{ type: "text", text: `Deleted load template ${params.load_template_id}.` }] };
        }
        catch (err) {
            return { content: [{ type: "text", text: agentError(err) }], isError: true };
        }
    });
}
//# sourceMappingURL=tools.js.map