import { z } from "zod";
import { WarpApiError } from "./client.js";
import { trackEvent, getAnalytics, getCustomerEmail } from "./analytics.js";
import { isCanadianPostal } from "./policy.js";
import { QUOTE_CARD_RESOURCE_URI, renderQuoteCard, toWidgetData, } from "./widgets/quote-card.js";
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
        result._meta = { "openai/outputTemplate": QUOTE_CARD_RESOURCE_URI, "openai/widgetAccessible": true, "openai/resultCanProduceWidget": true };
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
// Session-level cache: PRICING_xxx -> amount so warp_book can log revenue
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
// Log quotes to our DB so warp_quote_history works across all surfaces
async function logQuote(apiKey, quoteId, originZip, destZip, mode, priceCents, pallets) {
    if (!apiKey || !quoteId)
        return;
    try {
        await fetch("https://www.wearewarp.com/api/v1/freight/quote-log", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
            body: JSON.stringify({ quoteId, originZip, destZip, mode, priceCents, pallets }),
        });
    }
    catch { /* non-fatal */ }
}
export function registerTools(server, client, getApiKey) {
    // Called fresh on every tool invocation — picks up CLI login/signup without MCP restart
    const WARP_API_KEY = getApiKey;
    // ── 1. warp_van_quote ───────────────────────────────────────────
    server.tool("warp_van_quote", "Quote a cargo van shipment (1-3 pallets, firm price, 15-min expiry)", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 2. warp_box_truck_quote ─────────────────────────────────────
    server.tool("warp_box_truck_quote", "Quote a 26' box truck shipment (1-12 pallets, firm price, 15-min expiry)", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 3. warp_ftl_quote ───────────────────────────────────────────
    server.tool("warp_ftl_quote", "Quote a full truckload (53' dry van). Only origin, destination, and date required.", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 4. warp_ltl_quote ───────────────────────────────────────────
    server.tool("warp_ltl_quote", "Quote an LTL shipment. Provide dims + commodity for a firm quote; omit for indicative pricing (FAK rates if no freight class). Do not editorialize the results. Do not declare a winner or recommend a specific carrier. Present Warp's quote first, then list market options as context. Let the user decide.", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 5. warp_book ────────────────────────────────────────────────
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
    server.tool("warp_book", "Book a quoted shipment using any quote_id or option id returned from a quote tool (Warp or market carrier). Requires quote_id + pickup and delivery addresses. Auth required.", {
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
            // Guard: require a quote in this session so the listItems context is
            // cached and we fail fast with a clear "re-quote" message.
            const quoteId = params.quote_id;
            const cachedAmount = quoteAmountCache.get(quoteId);
            if (!cachedAmount) {
                return { content: [{ type: "text", text: `Cannot book: no quote found for ${quoteId} in this session. Quote ids are short-lived and rotate on every quote call. Run warp_ltl_quote (or van/box-truck/ftl quote) first, then book immediately after.` }], isError: true };
            }
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
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 6. warp_track ───────────────────────────────────────────────
    server.tool("warp_track", "Track a shipment by ID or tracking number. Auth required.", {
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
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 8. warp_lane_history ────────────────────────────────────────
    server.tool("warp_lane_history", "Get shipping history for your lanes (past shipments, last consignee, counts). Auth required.", {}, { title: "View Lane History", readOnlyHint: true }, async () => {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 9. warp_list_bookings ───────────────────────────────────────
    server.tool("warp_list_bookings", "List recent bookings for this API key, newest first. Auth required.", {
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
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 11. warp_status ─────────────────────────────────────────────
    server.tool("warp_status", "Check Warp API health and version. Also validates your API key if one is configured.", {}, { title: "Check API Status", readOnlyHint: true }, async () => {
        const start = Date.now();
        try {
            // Hit www.wearewarp.com/api/v1/version (not gw) — gw requires different auth on /version
            const res = await fetch("https://www.wearewarp.com/api/v1/version", { signal: AbortSignal.timeout(5000) });
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 12. warp_events ─────────────────────────────────────────────
    server.tool("warp_events", "Get the full tracking event history for a shipment (timeline of pickups, in-transit updates, deliveries). Auth required.", {
        shipment_id: z.string().describe("Shipment ID from warp_book response"),
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 13. warp_get_invoice ────────────────────────────────────────
    server.tool("warp_get_invoice", "Retrieve the invoice for a delivered shipment (line items, taxes, payment status). Auth required.", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 14. warp_get_documents ──────────────────────────────────────
    server.tool("warp_get_documents", "List shipment documents (BOL, POD, customs forms, etc.). Returns download URLs. Auth required. To fetch the Bill of Lading, pass document_type='bol' — this is how EXTERNAL / brokered (market-carrier) BOLs are returned now, not just Warp-carrier ones.", {
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
            return { content: [{ type: "text", text: errText(err) }], isError: true };
        }
    });
    // ── 15. warp_quote_history ──────────────────────────────────────────────────────
    server.tool("warp_quote_history", "List your recent freight quotes (LTL, van, box truck, FTL) from all sessions. Useful for surfacing prior pricing on similar lanes. Auth required.", {}, { title: "View Quote History", readOnlyHint: true }, async () => {
        const start = Date.now();
        try {
            const res = await fetch("https://www.wearewarp.com/api/v1/freight/quote-log", {
                headers: { "Authorization": `Bearer ${WARP_API_KEY() ?? ""}` },
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
    // ── warp_login ────────────────────────────────────────────────
    server.tool("warp_login", "Log in to Warp with email and password. Saves credentials locally so booking tools work. Call this if the user needs to authenticate or if warp_payment_status says no key is configured.", {
        email: z.string().email().describe("Warp account email"),
        password: z.string().min(1).describe("Warp account password"),
    }, { title: "Log In to Warp" }, async (params) => {
        try {
            const CUSTOMER_URL = "https://customer.wearewarp.com";
            const ts = new Date().toISOString().replace(/[-T:.Z]/g, "").slice(0, 14);
            const headers = { "Content-Type": "application/json", "app": `4;0.1.362;${ts}`, "Origin": CUSTOMER_URL };
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
                headers: { "Authorization": `Bearer ${rawKey}`, "Content-Type": "application/json" },
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
    // ── warp_payment_status ───────────────────────────────────────
    server.tool("warp_payment_status", "Check if the current Warp account has a payment method on file. Call this if the user asks about their payment status, or before booking if you want to confirm they can book. Returns has_card and onboard_url if a card needs to be added.", {}, { title: "Check Payment Status", readOnlyHint: true }, async () => {
        // Use the session API key passed to registerTools — never read from env/disk
        const apiKey = WARP_API_KEY();
        if (!apiKey) {
            return { content: [{ type: "text", text: "No API key found. The user needs to run warp-agent login first." }], isError: true };
        }
        try {
            const res = await fetch("https://www.wearewarp.com/api/v1/agents/me", {
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
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
    // ── warp_analytics ─────────────────────────────────────────
    server.tool("warp_analytics", "Show bookings analytics: total revenue, shipment count, breakdown by source (mcp vs cli). Use this to track how much revenue has been generated through AI tools.", {}, { title: "View Analytics", readOnlyHint: true }, async () => {
        const apiKey = WARP_API_KEY();
        if (!apiKey) {
            return { content: [{ type: "text", text: "No API key found. Run warp-agent login first." }], isError: true };
        }
        const analytics = getAnalytics();
        return { content: [{ type: "text", text: JSON.stringify(analytics, null, 2) }] };
    });
}
//# sourceMappingURL=tools.js.map