/**
 * WarpClient for MCP — direct against gw.wearewarp.com.
 * Auth: apikey header (same key as customer.wearewarp.com/dashboard/developer).
 */
export class WarpApiError extends Error {
    status;
    body;
    constructor(status, body) {
        super(`Warp API ${status}: ${JSON.stringify(body)}`);
        this.status = status;
        this.body = body;
        this.name = "WarpApiError";
    }
}
const CLIENT_VERSION = "0.3.0";
const USER_AGENT = `warp-agent-mcp/${CLIENT_VERSION}`;
export class WarpClient {
    base;
    getApiKey;
    /**
     * Quote-context cache, keyed by quote_id (Warp PRICING_… and every market
     * option id). Populated whenever a quote runs; consulted by book() so the
     * atomic /freight/book call can be reconstructed (pallets, weight, pickup
     * date) without the caller re-supplying freight details that the quote
     * already pinned down.
     */
    quoteCtxCache = new Map();
    constructor(baseUrl, apiKeyOrGetter) {
        this.base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        if (typeof apiKeyOrGetter === "function") {
            this.getApiKey = apiKeyOrGetter;
        }
        else {
            const k = apiKeyOrGetter;
            this.getApiKey = () => k;
        }
    }
    rememberQuote(ids, ctx) {
        for (const id of ids) {
            if (id)
                this.quoteCtxCache.set(id, ctx);
        }
    }
    headers(auth) {
        const h = {
            "content-type": "application/json",
            accept: "application/json",
            "user-agent": USER_AGENT,
        };
        if (auth) {
            const key = this.getApiKey();
            if (key) {
                // Default path: warp-site proxy at www.wearewarp.com/api/v1/warp/*.
                // The proxy's authAgent accepts wak_live_* / wak_test_* via Bearer.
                // When overridden to hit gw.wearewarp.com directly, also send the
                // legacy `apikey:` header (raw gateway key) as a fallback.
                h["authorization"] = `Bearer ${key}`;
                if (this.base.includes("gw.wearewarp.com")) {
                    h["apikey"] = key;
                }
            }
        }
        return h;
    }
    async request(method, path, opts) {
        const rel = path.startsWith("/") ? path.slice(1) : path;
        const url = new URL(rel, this.base);
        if (opts?.query) {
            for (const [k, v] of Object.entries(opts.query))
                url.searchParams.set(k, v);
        }
        const res = await fetch(url, {
            method,
            headers: this.headers(opts?.auth ?? false),
            body: opts?.body ? JSON.stringify(opts.body) : undefined,
            redirect: "follow",
        });
        const text = await res.text();
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = { raw: text };
        }
        if (!res.ok)
            throw new WarpApiError(res.status, json);
        return json;
    }
    // ── Quote (public) ────────────────────────────────────────────
    async vanQuote(params) {
        const key = this.getApiKey();
        if (key) {
            const listItems = [{ name: "Pallet", quantity: params.pallets ?? 1, totalWeight: (params.pallets ?? 1) * (params.weight_lbs_per_pallet ?? 200), weightUnit: "lbs", length: 48, width: 40, height: 48, sizeUnit: "IN", stackable: false }];
            return this._dualQuote(params, listItems, params.pickup_services ?? [], params.delivery_services ?? []);
        }
        return this._publicQuote(params, "FTL", "CARGO_VAN");
    }
    async boxTruckQuote(params) {
        const key = this.getApiKey();
        if (key) {
            const listItems = [{ name: "Pallet", quantity: params.pallets ?? 1, totalWeight: (params.pallets ?? 1) * (params.weight_lbs_per_pallet ?? 500), weightUnit: "lbs", length: 48, width: 40, height: 48, sizeUnit: "IN", stackable: false }];
            return this._dualQuote(params, listItems, params.pickup_services ?? [], params.delivery_services ?? []);
        }
        return this._publicQuote(params, "FTL", "STRAIGHT_TRUCK_26");
    }
    async ftlQuote(params) {
        const pallets = params.pallets || 1;
        const weight = params.weight_lbs_per_pallet || 1000;
        const originZip = String(params.origin_zip ?? "");
        const destZip = String(params.destination_zip ?? "");
        // FTL uses the public search endpoint with shipmentType + vehicleType
        const PUBLIC_FTL_URL = "https://gw.wearewarp.com/api/v1/p/customer-cli/freight-quote/search";
        const PUBLIC_KEY = "warp-public-freight-quote@wearewarp.com";
        const body = {
            key: PUBLIC_KEY,
            shipmentType: "FTL",
            vehicleType: { code: params.vehicle_type || "DRY_VAN_53" },
            pickZipcode: originZip,
            dropZipcode: destZip,
            pickDate: params.pickup_date,
            packaging: {
                ltlItems: [{ name: "Freight", length: 48, width: 40, height: 48, qty: pallets, qtyUnit: "Pallet", weightPerUnit: weight, weightUnit: "lbs", weightTotal: pallets * weight }],
            },
            isHazardous: false,
            isTemperatureControlled: false,
            pickupServices: [],
            dropoffServices: [],
        };
        const res = await fetch(PUBLIC_FTL_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok)
            throw new Error(`FTL quote failed: ${res.status}`);
        const data = await res.json();
        const rawQuotes = data?.data?.quote ?? [];
        // Find Warp quote vs market
        const getOpt = (q) => q?.warpQuote?.option ?? {};
        const getRate = (opt) => opt?.rate?.avg ?? 0;
        const warpQuote = rawQuotes.find((q) => getOpt(q)?.carrierName?.toString().toLowerCase().includes('warp'));
        const marketOpts = rawQuotes
            .filter((q) => !getOpt(q)?.carrierName?.toString().toLowerCase().includes('warp'))
            .map((q) => {
            const raw = q;
            const opt = getOpt(raw);
            return {
                source: opt?.source || "market",
                id: opt?.id || "",
                carrierName: opt?.carrierName || "Unknown",
                transitTime: (raw?.transitDay ?? 0) * 86400,
                rate: getRate(opt),
                serviceLevel: opt?.serviceLevel || "STANDARD",
                shipmentType: "FTL",
            };
        });
        const hasWarp = !!warpQuote;
        const warpOpt = hasWarp ? getOpt(warpQuote) : {};
        const warpPrice = getRate(warpOpt);
        const warpId = warpOpt?.id ?? null;
        const warpTransit = warpQuote?.transitDay ?? null;
        return {
            warp_quote_id: hasWarp ? warpId : null,
            warp_price: hasWarp ? warpPrice : null,
            warp_transit_days: hasWarp ? warpTransit : null,
            options: marketOpts,
            _note: hasWarp
                ? `Warp FTL quote_id: ${warpId} \u2014 use this id with warp_book to book`
                : `No Warp FTL coverage on this lane (${originZip} \u2192 ${destZip}). Market options shown for reference.`,
        };
    }
    async _dualQuote(params, listItems, pickupServices = [], deliveryServices = []) {
        const originZip = String(params.origin_zip ?? "");
        const destZip = String(params.destination_zip ?? "");
        const [warpResult, marketResult] = await Promise.allSettled([
            this.request("POST", "/freights/quote", {
                body: { pickupDate: params.pickup_date, pickupInfo: { zipcode: originZip }, deliveryInfo: { zipcode: destZip }, listItems },
                auth: true,
            }),
            this.request("POST", "/freights/freight-quote", {
                body: { pickupDate: params.pickup_date, pickupInfo: { zipcode: originZip }, deliveryInfo: { zipcode: destZip }, items: listItems, pickupServices, dropoffServices: deliveryServices },
                auth: true,
            }),
        ]);
        // If both calls failed with auth errors, surface a clear login prompt instead of empty results
        const warpErr = warpResult.status === "rejected" ? warpResult.reason : null;
        const marketErr = marketResult.status === "rejected" ? marketResult.reason : null;
        if (warpErr instanceof WarpApiError && marketErr instanceof WarpApiError &&
            (warpErr.status === 401 || warpErr.status === 403) &&
            (marketErr.status === 401 || marketErr.status === 403)) {
            throw new Error("API key invalid or not configured. Run \`warp-agent login\` first, then restart your AI client.");
        }
        const warp = warpResult.status === "fulfilled" ? warpResult.value : null;
        const market = marketResult.status === "fulfilled" ? marketResult.value : null;
        const hasWarp = !!(warp?.quote_id);
        const options = market?.options ?? [];
        // Cache freight context against every id returned (warp's PRICING_… plus
        // every market option id) so book() can rebuild the atomic /freight/book
        // payload (pallets, weight, pickup date) without the caller re-supplying
        // freight details the quote already pinned down.
        const firstItem = (listItems[0] ?? {});
        const pallets = Number(firstItem.quantity ?? 0) || undefined;
        const totalWeight = Number(firstItem.totalWeight ?? 0);
        const weightPerPallet = pallets && totalWeight > 0 ? Math.round(totalWeight / pallets) : undefined;
        this.rememberQuote([hasWarp ? warp.quote_id : undefined, ...options.map((o) => o.id)], { items: listItems, pickupDate: params.pickup_date, pallets, weightPerPallet });
        return {
            warp_quote_id: hasWarp ? warp.quote_id : null,
            warp_price: hasWarp ? (warp.price?.amount ?? null) : null,
            warp_transit_days: hasWarp ? (warp.transit_time ?? null) : null,
            options,
            _items: listItems,
            _note: hasWarp
                ? `Warp quote_id: ${warp.quote_id} \u2014 use this id with warp_book to book`
                : `Warp does not have direct coverage on this lane (${originZip} \u2192 ${destZip}). Market options shown for reference. Do not recommend any carrier \u2014 present the data and let the user decide.`,
        };
    }
    async ltlQuote(params, _originZip, _destZip) {
        const key = this.getApiKey();
        if (key)
            return this._dualQuote(params, [{
                    name: params.commodity || "Freight",
                    quantity: params.pallets ?? 1,
                    totalWeight: (params.pallets ?? 1) * (params.weight_lbs_per_pallet ?? 500),
                    weightUnit: "lbs",
                    length: params.length_in ?? 48,
                    width: params.width_in ?? 40,
                    height: params.height_in ?? 48,
                    sizeUnit: "IN",
                    stackable: params.stackable ?? false,
                }], params.pickup_services ?? [], params.delivery_services ?? []);
        return this._publicQuote(params, "LTL");
    }
    async _publicQuote(params, shipmentType, vehicleTypeCode) {
        const originZip = String(params.origin_zip ?? params.origin_zip ?? "");
        const destZip = String(params.destination_zip ?? "");
        const pallets = params.pallets || 1;
        const weight = params.weight_lbs_per_pallet || 300;
        const commodity = params.commodity || "Freight";
        const length = params.length_in || 48;
        const width = params.width_in || 40;
        const height = params.height_in || 48;
        const PUBLIC_URL = "https://gw.wearewarp.com/api/v1/p/customer-cli/freight-quote/search";
        const PUBLIC_KEY = "warp-public-freight-quote@wearewarp.com";
        const body = {
            key: PUBLIC_KEY,
            shipmentType,
            pickZipcode: originZip,
            dropZipcode: destZip,
            pickDate: params.pickup_date,
            packaging: {
                ltlItems: [{ name: commodity, length, width, height, qty: pallets, qtyUnit: "Pallet", weightPerUnit: weight, weightUnit: "lbs", weightTotal: pallets * weight }],
            },
            isHazardous: !!(params.hazmat),
            isTemperatureControlled: false,
            pickupServices: params.pickup_services ?? [],
            dropoffServices: params.delivery_services ?? [],
        };
        if (vehicleTypeCode)
            body.vehicleType = { code: vehicleTypeCode };
        const res = await fetch(PUBLIC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!res.ok)
            throw new Error(`Quote failed: ${res.status}`);
        const data = await res.json();
        const rawQuotes = data?.data?.quote ?? [];
        const isWarpQuote = (q) => {
            const r = q;
            const src = String(r?.source ?? "").toUpperCase();
            const warpOpt = r?.warpQuote?.option;
            return src === "WARP" || warpOpt?.carrierName?.toString().toLowerCase().includes("warp");
        };
        const getRate = (q) => {
            const r = q;
            const tc = r?.total_charge;
            if (tc?.value)
                return Math.round(tc.value / 100 * 100) / 100; // US_cent to USD
            const warpOpt = r?.warpQuote?.option;
            const rateObj = warpOpt?.rate;
            return rateObj?.avg ?? 0;
        };
        const getQuoteId = (q) => {
            const r = q;
            return r?.warpQuote?.option
                ? String(r?.warpQuote?.option?.id ?? "")
                : null;
        };
        const getTransit = (q) => {
            const r = q;
            return r?.transitDay ?? null;
        };
        const warpQuote = rawQuotes.find(isWarpQuote);
        const marketOpts = rawQuotes
            .filter(q => !isWarpQuote(q))
            .map(q => {
            const r = q;
            const opt = r?.warpQuote?.option ?? r;
            return {
                source: r?.source || opt?.source || "market",
                id: opt?.id || "",
                carrierName: opt?.carrierName || r?.scac || "Unknown",
                transitTime: (r?.transitDay ?? 0) * 86400,
                rate: getRate(q),
                serviceLevel: opt?.serviceLevel || "STANDARD",
                shipmentType,
            };
        });
        const hasWarp = !!warpQuote;
        const warpRate = hasWarp ? getRate(warpQuote) : null;
        const warpId = hasWarp ? getQuoteId(warpQuote) : null;
        const warpTransit = hasWarp ? getTransit(warpQuote) : null;
        return {
            warp_quote_id: warpId,
            warp_price: warpRate,
            warp_transit_days: warpTransit,
            options: marketOpts,
            _note: hasWarp
                ? `Warp quote_id: ${warpId} — use this id with warp_book to book`
                : `No Warp coverage on this lane (${originZip} → ${destZip}). Market options shown for reference.`,
        };
    }
    async _oldLtlQuote(params, originZip, destZip) {
        const listItems = [{
                name: params.commodity || "Freight",
                quantity: params.pallets ?? 1,
                totalWeight: (params.pallets ?? 1) * (params.weight_lbs_per_pallet ?? 500),
                weightUnit: "lbs",
                length: params.length_in ?? 48,
                width: params.width_in ?? 40,
                height: params.height_in ?? 48,
                sizeUnit: "IN",
                stackable: params.stackable ?? false,
            }];
        const pickupServices = params.pickup_services ?? [];
        const deliveryServices = params.delivery_services ?? [];
        // Run both in parallel: primary Warp quote (bookable) + market comparison
        const [warpResult, marketResult] = await Promise.allSettled([
            this.request("POST", "/freights/quote", {
                body: { pickupDate: params.pickup_date, pickupInfo: { zipcode: params.origin_zip }, deliveryInfo: { zipcode: params.destination_zip }, listItems },
                auth: true,
            }),
            this.request("POST", "/freights/freight-quote", {
                body: { pickupDate: params.pickup_date, pickupInfo: { zipcode: params.origin_zip }, deliveryInfo: { zipcode: params.destination_zip }, items: listItems, pickupServices, dropoffServices: deliveryServices },
                // shipmentType omitted — "LTL" returns 0 options, omitting returns all carriers
                auth: true,
            }),
        ]);
        // Surface auth errors clearly instead of returning empty results
        const warpErr = warpResult.status === "rejected" ? warpResult.reason : null;
        const marketErr = marketResult.status === "rejected" ? marketResult.reason : null;
        if (warpErr instanceof WarpApiError && marketErr instanceof WarpApiError &&
            (warpErr.status === 401 || warpErr.status === 403) &&
            (marketErr.status === 401 || marketErr.status === 403)) {
            throw new Error("API key invalid or not configured. Run \`warp-agent login\` first, then restart your AI client.");
        }
        const warp = warpResult.status === "fulfilled" ? warpResult.value : null;
        const market = marketResult.status === "fulfilled" ? marketResult.value : null;
        // Return combined result
        const marketOptions = market?.options ?? [];
        const hasWarp = !!(warp?.quote_id);
        return {
            warp_quote_id: hasWarp ? warp.quote_id : null,
            warp_price: hasWarp ? (warp.price?.amount ?? null) : null,
            warp_transit_days: hasWarp ? (warp.transit_time ?? null) : null,
            options: marketOptions,
            _items: listItems,
            _note: hasWarp
                ? `Warp quote_id: ${warp.quote_id} — use this id with warp_book to book`
                : `Warp does not have direct coverage on this lane (${originZip} \u2192 ${destZip}). Market options are shown for reference. Do not recommend any carrier over another — present the data and let the user decide.`,
        };
    }
    _deadcode(params) {
        return this.request("POST", "/freights/freight-quote", {
            body: {},
            auth: true,
        });
    }
    // ── Booking (auth) ────────────────────────────────────────────
    /**
     * Book a quoted shipment via the ATOMIC /freight/book endpoint.
     *
     * This endpoint charges the card AND books the shipment in a single
     * server-side transaction, returning { ok, trackingNumber, orderId,
     * shipmentId, charged, stripePaymentIntentId }. That atomicity is the whole
     * point: the previous flow made two separate client calls — POST
     * /agents/charge-me, then POST /freights/booking — so a booking failure
     * after a successful charge left the customer charged with no shipment. By
     * collapsing to one call, the client can no longer create a charged-but-not-
     * booked state; charge/book coordination lives server-side where it belongs.
     *
     * The endpoint lives at /api/v1/freight/book (one level up from the
     * /api/v1/warp/ proxy base), and takes a flat address shape (zip / contact /
     * company) plus pallets / weightPerPallet / pickupDate, which we replay from
     * the quote-context cache populated at quote time.
     */
    async book(params) {
        const quoteId = params.quote_id;
        const ctx = this.quoteCtxCache.get(quoteId);
        const pickup = params.pickup;
        const delivery = params.delivery;
        // Remap the MCP address shape (zipCode/contactName) → the atomic
        // endpoint's flat shape (zip/contact/company).
        //
        // The /freight/book endpoint REQUIRES an email on both stops. We advertise
        // delivery.email as optional (consignee email is frequently unknown — per
        // the bug report), so when it's absent we fall back to the shipper's own
        // pickup email, then a Warp noreply, so the endpoint is always satisfied
        // and the booking doesn't fail late with "delivery.email is required".
        const mapAddr = (a, fallbackEmail) => ({
            company: a.company ?? a.contactName,
            contact: a.contactName,
            phone: a.phone,
            email: a.email ?? fallbackEmail,
            street: a.street,
            city: a.city,
            state: a.state,
            zip: a.zipCode,
            ...(a.specialInstruction ? { specialInstruction: a.specialInstruction } : {}),
        });
        const pickupEmail = pickup?.email;
        const body = { quoteId };
        if (ctx?.pickupDate)
            body.pickupDate = ctx.pickupDate;
        if (ctx?.pallets)
            body.pallets = ctx.pallets;
        if (ctx?.weightPerPallet)
            body.weightPerPallet = ctx.weightPerPallet;
        if (pickup)
            body.pickup = mapAddr(pickup);
        if (delivery)
            body.delivery = mapAddr(delivery, pickupEmail ?? "noreply@wearewarp.com");
        if (params.reference)
            body.referenceNo = params.reference;
        if (params.notes)
            body.note = params.notes;
        // Atomic endpoint is at the proxy root (/api/v1/freight/book), one level
        // above the /api/v1/warp/ base. Strip the trailing /warp/ to reach it.
        const atomicBookUrl = this.base.replace(/\/warp\/?$/, "/") + "freight/book";
        const res = await fetch(atomicBookUrl, {
            method: "POST",
            headers: this.headers(true),
            body: JSON.stringify(body),
            redirect: "follow",
        });
        const text = await res.text();
        let json;
        try {
            json = JSON.parse(text);
        }
        catch {
            json = { raw: text };
        }
        if (!res.ok)
            throw new WarpApiError(res.status, json);
        return json;
    }
    // ── Shipments list (auth) ─────────────────────────────────────
    listBookings(limit) {
        return this.request("GET", "/freights/shipments", {
            auth: true,
            query: limit ? { pageSize: String(limit) } : undefined,
        });
    }
    // ── Tracking (auth) ───────────────────────────────────────────
    track(shipmentId) {
        return this.request("POST", "/freights/tracking", {
            body: { trackingNumbers: [shipmentId] },
            auth: true,
        });
    }
    // ── Cancel (auth) ─────────────────────────────────────────────
    cancel(params) {
        // Correct route: POST /freights/orders/{orderId}/cancel
        // Note: Warp's API returns 400 "Customer not allow cancel order" — cancellations must be done via Warp support
        const orderId = (params.order_id ?? params.booking_id ?? params.orderId);
        if (!orderId)
            throw new Error("order_id is required to cancel a booking");
        return this.request("POST", `/freights/orders/${encodeURIComponent(orderId)}/cancel`, { body: {}, auth: true });
    }
    // ── Events (auth) ─────────────────────────────────────────────
    events(shipmentId) {
        return this.request("GET", `/freights/events/${encodeURIComponent(shipmentId)}`, { auth: true });
    }
    // ── Invoice (auth) ────────────────────────────────────────────
    invoice(orderId) {
        return this.request("GET", `/freights/invoices/${encodeURIComponent(orderId)}`, { auth: true });
    }
    // ── Documents (auth) ──────────────────────────────────────────
    documents(orderId) {
        return this.request("GET", `/freights/documents/${encodeURIComponent(orderId)}`, { auth: true });
    }
    // ── Quote history (auth) ──────────────────────────────────────
    quoteHistory() {
        return this.request("GET", "/freights/quote-history", { auth: true });
    }
    // ── Lane history (auth) ───────────────────────────────────────
    laneHistory() {
        return this.request("GET", "/freights/shipments?pageSize=100", { auth: true });
    }
    // ── Rate card ─────────────────────────────────────────────────
    rateCard() {
        return this.request("GET", "/customers/rate-card", { auth: true });
    }
    // ── Multi-stop FTL (auth) ─────────────────────────────────────
    multistopQuote(params) {
        // Transform MCP stops[] schema → Warp API pickupInfo/deliveryInfo/transits format
        const stops = params.stops ?? [];
        const pickupStop = stops.find(s => s.type === 'pickup');
        const deliveryStop = stops.filter(s => s.type === 'delivery').pop();
        const transitStops = stops.filter((s, i) => i > 0 && !(s === deliveryStop));
        const totalPallets = Number(params.total_pallets ?? 1);
        const totalWeight = Number(params.total_weight_lbs ?? 500);
        const weightPerUnit = Math.round(totalWeight / totalPallets);
        const listItems = [{
                name: 'Freight',
                qty: totalPallets,
                quantity: totalPallets,
                qtyUnit: 'Pallet',
                weightPerUnit,
                totalWeight,
                weightTotal: totalWeight,
                weightUnit: 'lbs',
                length: 48, width: 40, height: 48, sizeUnit: 'IN',
            }];
        const body = {
            pickupDate: params.pickup_date,
            pickupInfo: { zipcode: pickupStop?.address?.zipCode },
            deliveryInfo: { zipcode: deliveryStop?.address?.zipCode },
            transits: transitStops.map(s => ({ zipcode: s.address.zipCode })),
            listItems,
            shipmentType: 'FTL',
        };
        if (params.vehicle_type)
            body.vehicleType = params.vehicle_type;
        return this.request("POST", "/freights/quote/multi-stops", { body, auth: true });
    }
    multistopBook(params) {
        const body = {
            quoteId: params.quote_id,
            stops: params.stops,
        };
        if (params.reference)
            body.reference = params.reference;
        if (params.notes)
            body.notes = params.notes;
        return this.request("POST", "/freights/booking/multi-stops", { body, auth: true });
    }
    // ── Status (public) ───────────────────────────────────────────
    status() {
        return this.request("GET", "/version", { auth: true });
    }
}
//# sourceMappingURL=client.js.map