/**
 * WarpClient for MCP — direct against gw.wearewarp.com.
 * Auth: apikey header (same key as customer.wearewarp.com/dashboard/developer).
 */

export class WarpApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`Warp API ${status}: ${JSON.stringify(body)}`);
    this.name = "WarpApiError";
  }
}

const CLIENT_VERSION = "0.3.0";
const USER_AGENT = `warp-agent-mcp/${CLIENT_VERSION}`;

/** Freight details captured at quote time, replayed at book time so the
 *  atomic /freight/book call matches what was quoted. */
interface CachedQuote {
  items: unknown[];
  pickupDate?: string;
  pallets?: number;
  weightPerPallet?: number;
}

export class WarpClient {
  private base: string;

  private getApiKey: () => string | undefined;

  /**
   * Quote-context cache, keyed by quote_id (Warp PRICING_… and every market
   * option id). Populated whenever a quote runs; consulted by book() so the
   * atomic /freight/book call can be reconstructed (pallets, weight, pickup
   * date) without the caller re-supplying freight details that the quote
   * already pinned down.
   */
  private quoteCtxCache: Map<string, CachedQuote> = new Map();

  constructor(baseUrl: string, apiKeyOrGetter?: string | (() => string | undefined)) {
    this.base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    if (typeof apiKeyOrGetter === "function") {
      this.getApiKey = apiKeyOrGetter;
    } else {
      const k = apiKeyOrGetter;
      this.getApiKey = () => k;
    }
  }

  private rememberQuote(ids: Array<string | undefined>, ctx: CachedQuote): void {
    for (const id of ids) {
      if (id) this.quoteCtxCache.set(id, ctx);
    }
  }

  private headers(auth: boolean): Record<string, string> {
    const h: Record<string, string> = {
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

  private async request(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts?: { body?: unknown; auth?: boolean; query?: Record<string, string> },
  ): Promise<unknown> {
    const rel = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(rel, this.base);
    if (opts?.query) {
      for (const [k, v] of Object.entries(opts.query)) url.searchParams.set(k, v);
    }

    const res = await fetch(url, {
      method,
      headers: this.headers(opts?.auth ?? false),
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      redirect: "follow",
    });

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) throw new WarpApiError(res.status, json);
    return json;
  }

  // ── Quote (public) ────────────────────────────────────────────

  async vanQuote(params: Record<string, unknown>) {
    const key = this.getApiKey();
    if (key) {
      const listItems = [{ name: "Pallet", quantity: params.pallets ?? 1, totalWeight: (params.pallets as number ?? 1) * (params.weight_lbs_per_pallet as number ?? 200), weightUnit: "lbs", length: 48, width: 40, height: 48, sizeUnit: "IN", stackable: false }];
      return this._dualQuote(params, listItems, params.pickup_services as string[] ?? [], params.delivery_services as string[] ?? []);
    }
    return this._publicQuote(params, "FTL", "CARGO_VAN");
  }

  async boxTruckQuote(params: Record<string, unknown>) {
    const key = this.getApiKey();
    if (key) {
      const listItems = [{ name: "Pallet", quantity: params.pallets ?? 1, totalWeight: (params.pallets as number ?? 1) * (params.weight_lbs_per_pallet as number ?? 500), weightUnit: "lbs", length: 48, width: 40, height: 48, sizeUnit: "IN", stackable: false }];
      return this._dualQuote(params, listItems, params.pickup_services as string[] ?? [], params.delivery_services as string[] ?? []);
    }
    return this._publicQuote(params, "FTL", "STRAIGHT_TRUCK_26");
  }

  async ftlQuote(params: Record<string, unknown>) {
    const pallets = (params.pallets as number) || 1;
    const weight = (params.weight_lbs_per_pallet as number) || 1000;
    const originZip = String(params.origin_zip ?? "");
    const destZip = String(params.destination_zip ?? "");

    // FTL uses the public search endpoint with shipmentType + vehicleType
    const PUBLIC_FTL_URL = "https://gw.wearewarp.com/api/v1/p/customer-cli/freight-quote/search";
    const PUBLIC_KEY = "warp-public-freight-quote@wearewarp.com";

    const body = {
      key: PUBLIC_KEY,
      shipmentType: "FTL",
      vehicleType: { code: (params.vehicle_type as string) || "DRY_VAN_53" },
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

    if (!res.ok) throw new Error(`FTL quote failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const rawQuotes: unknown[] = (data?.data as Record<string, unknown>)?.quote as unknown[] ?? [];

    // Find Warp quote vs market
    const getOpt = (q: unknown): Record<string,unknown> => ((q as Record<string,unknown>)?.warpQuote as Record<string,unknown>)?.option as Record<string,unknown> ?? {};
    const getRate = (opt: Record<string,unknown>): number => (opt?.rate as Record<string,unknown>)?.avg as number ?? 0;

    const warpQuote = rawQuotes.find((q: unknown) => getOpt(q)?.carrierName?.toString().toLowerCase().includes('warp')) as Record<string, unknown> | undefined;

    const marketOpts = rawQuotes
      .filter((q: unknown) => !getOpt(q)?.carrierName?.toString().toLowerCase().includes('warp'))
      .map((q: unknown) => {
        const raw = q as Record<string, unknown>;
        const opt = getOpt(raw);
        return {
          source: opt?.source || "market",
          id: opt?.id || "",
          carrierName: opt?.carrierName || "Unknown",
          transitTime: ((raw?.transitDay as number) ?? 0) * 86400,
          rate: getRate(opt),
          serviceLevel: opt?.serviceLevel || "STANDARD",
          shipmentType: "FTL",
        };
      });

    const hasWarp = !!warpQuote;
    const warpOpt = hasWarp ? getOpt(warpQuote!) : {} as Record<string,unknown>;
    const warpPrice = getRate(warpOpt);
    const warpId = warpOpt?.id as string ?? null;
    const warpTransit = (warpQuote as Record<string,unknown>)?.transitDay as number ?? null;

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

  private async _dualQuote(params: Record<string, unknown>, listItems: unknown[], pickupServices: string[] = [], deliveryServices: string[] = []) {
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

    const warp = warpResult.status === "fulfilled" ? warpResult.value as Record<string, unknown> : null;
    const market = marketResult.status === "fulfilled" ? marketResult.value as Record<string, unknown> : null;
    const hasWarp = !!(warp?.quote_id);
    const options = (market?.options as Array<Record<string, unknown>> | undefined) ?? [];
    // Cache freight context against every id returned (warp's PRICING_… plus
    // every market option id) so book() can rebuild the atomic /freight/book
    // payload (pallets, weight, pickup date) without the caller re-supplying
    // freight details the quote already pinned down.
    const firstItem = (listItems[0] ?? {}) as Record<string, unknown>;
    const pallets = Number(firstItem.quantity ?? 0) || undefined;
    const totalWeight = Number(firstItem.totalWeight ?? 0);
    const weightPerPallet = pallets && totalWeight > 0 ? Math.round(totalWeight / pallets) : undefined;
    this.rememberQuote(
      [hasWarp ? (warp!.quote_id as string) : undefined, ...options.map((o) => o.id as string | undefined)],
      { items: listItems, pickupDate: params.pickup_date as string | undefined, pallets, weightPerPallet },
    );
    return {
      warp_quote_id: hasWarp ? (warp!.quote_id as string) : null,
      warp_price: hasWarp ? ((warp!.price as Record<string, unknown>)?.amount ?? null) : null,
      warp_transit_days: hasWarp ? (warp!.transit_time ?? null) : null,
      options,
      _items: listItems,
      _note: hasWarp
        ? `Warp quote_id: ${warp!.quote_id} \u2014 use this id with warp_book to book`
        : `Warp does not have direct coverage on this lane (${originZip} \u2192 ${destZip}). Market options shown for reference. Do not recommend any carrier \u2014 present the data and let the user decide.`,
    };
  }

  async ltlQuote(params: Record<string, unknown>, _originZip?: string, _destZip?: string) {
    const key = this.getApiKey();
    if (key) return this._dualQuote(params, [{
      name: params.commodity || "Freight",
      quantity: params.pallets ?? 1,
      totalWeight: (params.pallets as number ?? 1) * (params.weight_lbs_per_pallet as number ?? 500),
      weightUnit: "lbs",
      length: params.length_in ?? 48,
      width: params.width_in ?? 40,
      height: params.height_in ?? 48,
      sizeUnit: "IN",
      stackable: params.stackable ?? false,
    }], (params.pickup_services as string[]) ?? [], (params.delivery_services as string[]) ?? []);
    return this._publicQuote(params, "LTL");
  }

  private async _publicQuote(params: Record<string, unknown>, shipmentType: string, vehicleTypeCode?: string) {
    const originZip = String(params.origin_zip ?? params.origin_zip ?? "");
    const destZip = String(params.destination_zip ?? "");
    const pallets = (params.pallets as number) || 1;
    const weight = (params.weight_lbs_per_pallet as number) || 300;
    const commodity = (params.commodity as string) || "Freight";
    const length = (params.length_in as number) || 48;
    const width = (params.width_in as number) || 40;
    const height = (params.height_in as number) || 48;

    const PUBLIC_URL = "https://gw.wearewarp.com/api/v1/p/customer-cli/freight-quote/search";
    const PUBLIC_KEY = "warp-public-freight-quote@wearewarp.com";

    const body: Record<string, unknown> = {
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
      pickupServices: (params.pickup_services as string[]) ?? [],
      dropoffServices: (params.delivery_services as string[]) ?? [],
    };
    if (vehicleTypeCode) body.vehicleType = { code: vehicleTypeCode };

    const res = await fetch(PUBLIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Quote failed: ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const rawQuotes: unknown[] = ((data?.data as Record<string, unknown>)?.quote as unknown[]) ?? [];

    const isWarpQuote = (q: unknown) => {
      const r = q as Record<string, unknown>;
      const src = String(r?.source ?? "").toUpperCase();
      const warpOpt = (r?.warpQuote as Record<string, unknown>)?.option as Record<string, unknown>;
      return src === "WARP" || warpOpt?.carrierName?.toString().toLowerCase().includes("warp");
    };
    const getRate = (q: unknown): number => {
      const r = q as Record<string, unknown>;
      const tc = r?.total_charge as Record<string, unknown>;
      if (tc?.value) return Math.round((tc.value as number) / 100 * 100) / 100; // US_cent to USD
      const warpOpt = (r?.warpQuote as Record<string, unknown>)?.option as Record<string, unknown>;
      const rateObj = warpOpt?.rate as Record<string, unknown>;
      return (rateObj?.avg as number) ?? 0;
    };
    const getQuoteId = (q: unknown): string | null => {
      const r = q as Record<string, unknown>;
      return (r?.warpQuote as Record<string, unknown>)?.option as unknown as string
        ? String(((r?.warpQuote as Record<string, unknown>)?.option as Record<string, unknown>)?.id ?? "")
        : null;
    };
    const getTransit = (q: unknown): number | null => {
      const r = q as Record<string, unknown>;
      return (r?.transitDay as number) ?? null;
    };

    const warpQuote = rawQuotes.find(isWarpQuote);
    const marketOpts = rawQuotes
      .filter(q => !isWarpQuote(q))
      .map(q => {
        const r = q as Record<string, unknown>;
        const opt = (r?.warpQuote as Record<string, unknown>)?.option as Record<string, unknown> ?? r;
        return {
          source: r?.source || opt?.source || "market",
          id: opt?.id || "",
          carrierName: opt?.carrierName || r?.scac || "Unknown",
          transitTime: ((r?.transitDay as number) ?? 0) * 86400,
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

  private async _oldLtlQuote(params: Record<string, unknown>, originZip?: string, destZip?: string) {
    const listItems = [{
      name:        params.commodity || "Freight",
      quantity:    params.pallets ?? 1,
      totalWeight: (params.pallets as number ?? 1) * (params.weight_lbs_per_pallet as number ?? 500),
      weightUnit:  "lbs",
      length:      params.length_in ?? 48,
      width:       params.width_in  ?? 40,
      height:      params.height_in ?? 48,
      sizeUnit:    "IN",
      stackable:   params.stackable ?? false,
    }];
    const pickupServices = (params.pickup_services as string[]) ?? [];
    const deliveryServices = (params.delivery_services as string[]) ?? [];

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

    const warp = warpResult.status === "fulfilled" ? warpResult.value as Record<string, unknown> : null;
    const market = marketResult.status === "fulfilled" ? marketResult.value as Record<string, unknown> : null;

    // Return combined result
    const marketOptions = (market?.options as unknown[]) ?? [];
    const hasWarp = !!(warp?.quote_id);

    return {
      warp_quote_id: hasWarp ? (warp!.quote_id as string) : null,
      warp_price: hasWarp ? ((warp!.price as Record<string, unknown>)?.amount ?? null) : null,
      warp_transit_days: hasWarp ? (warp!.transit_time ?? null) : null,
      options: marketOptions,
      _items: listItems,
      _note: hasWarp
        ? `Warp quote_id: ${warp!.quote_id} — use this id with warp_book to book`
        : `Warp does not have direct coverage on this lane (${originZip} \u2192 ${destZip}). Market options are shown for reference. Do not recommend any carrier over another — present the data and let the user decide.`,
    };
  }

  _deadcode(params: Record<string, unknown>) {
    return this.request("POST", "/freights/freight-quote", {
      body: {},
      auth: true,
    });
  }

  // ── Booking (auth) ────────────────────────────────────────────

  /**
   * Book a quoted shipment via /warp/freights/booking — the booking endpoint
   * in the SAME system as our quote endpoint (/warp/freights/quote), so the
   * PRICING_… / market-option ids we cache are valid here.
   *
   * NOTE on atomicity: this endpoint books only; the card is charged
   * separately by the caller (tools.ts → /agents/charge-me) BEFORE this runs.
   * That ordering carries a known risk — a booking failure after a successful
   * charge leaves the customer charged with no shipment. The atomic
   * /freight/book endpoint avoids that, but it lives in a DIFFERENT system
   * (paired with /freight/quote, which returns no market options) and does not
   * accept PRICING_ ids from /warp/freights/quote. Reconciling the two
   * systems (so we get atomicity without losing market quotes) is a backend
   * task — see the note in tools.ts warp_book.
   */
  book(params: Record<string, unknown>) {
    const pickup = params.pickup as Record<string, unknown> | undefined;
    const delivery = params.delivery as Record<string, unknown> | undefined;

    const defaultWindow = () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      return { from: `${tomorrow}T08:00:00.000Z`, to: `${tomorrow}T17:00:00.000Z` };
    };

    const buildStop = (addr: Record<string, unknown>) => ({
      locationName: addr.company || addr.contactName,
      contactName: addr.contactName,
      contactPhone: addr.phone,
      contactEmail: addr.email,
      address: {
        street: addr.street,
        city: addr.city,
        state: addr.state,
        zipcode: addr.zipCode,
        country: "US",
      },
      windowTime: defaultWindow(),
    });

    // listItems must match what was quoted (the gateway rejects mismatches).
    // Pull from the quote-context cache populated at quote time.
    const ctx = this.quoteCtxCache.get(params.quote_id as string);
    const items = (params.items as unknown[])
      || ctx?.items
      || [{ name: "Freight", quantity: 1, totalWeight: 200, weightUnit: "lbs", length: 48, width: 40, height: 48, sizeUnit: "IN", stackable: false }];

    const body: Record<string, unknown> = {
      quoteId: params.quote_id,
      listItems: items,
    };
    if (pickup) body.pickupInfo = buildStop(pickup);
    if (delivery) body.deliveryInfo = buildStop(delivery);
    if (params.reference) body.referenceNo = params.reference;
    if (params.notes) body.note = params.notes;

    return this.request("POST", "/freights/booking", { body, auth: true });
  }

  // ── Shipments list (auth) ─────────────────────────────────────

  listBookings(limit?: number) {
    return this.request("GET", "/freights/shipments", {
      auth: true,
      query: limit ? { pageSize: String(limit) } : undefined,
    });
  }

  // ── Tracking (auth) ───────────────────────────────────────────

  track(shipmentId: string) {
    return this.request("POST", "/freights/tracking", {
      body: { trackingNumbers: [shipmentId] },
      auth: true,
    });
  }

  // ── Cancel (auth) ─────────────────────────────────────────────

  cancel(params: Record<string, unknown>) {
    // Correct route: POST /freights/orders/{orderId}/cancel
    // Note: Warp's API returns 400 "Customer not allow cancel order" — cancellations must be done via Warp support
    const orderId = (params.order_id ?? params.booking_id ?? params.orderId) as string;
    if (!orderId) throw new Error("order_id is required to cancel a booking");
    return this.request("POST", `/freights/orders/${encodeURIComponent(orderId)}/cancel`, { body: {}, auth: true });
  }

  // ── Events (auth) ─────────────────────────────────────────────

  events(shipmentId: string) {
    return this.request("GET", `/freights/events/${encodeURIComponent(shipmentId)}`, { auth: true });
  }

  // ── Invoice (auth) ────────────────────────────────────────────

  invoice(orderId: string) {
    return this.request("GET", `/freights/invoices/${encodeURIComponent(orderId)}`, { auth: true });
  }

  // ── Documents (auth) ──────────────────────────────────────────

  documents(orderId: string) {
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

  multistopQuote(params: Record<string, unknown>) {
    // Transform MCP stops[] schema → Warp API pickupInfo/deliveryInfo/transits format
    const stops = (params.stops as Array<{ type: string; address: { zipCode: string }; pallets?: number; weight_lbs?: number }>) ?? [];
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
    const body: Record<string, unknown> = {
      pickupDate: params.pickup_date,
      pickupInfo: { zipcode: pickupStop?.address?.zipCode },
      deliveryInfo: { zipcode: deliveryStop?.address?.zipCode },
      transits: transitStops.map(s => ({ zipcode: s.address.zipCode })),
      listItems,
      shipmentType: 'FTL',
    };
    if (params.vehicle_type) body.vehicleType = params.vehicle_type;
    return this.request("POST", "/freights/quote/multi-stops", { body, auth: true });
  }

  multistopBook(params: Record<string, unknown>) {
    const body: Record<string, unknown> = {
      quoteId: params.quote_id,
      stops: params.stops,
    };
    if (params.reference) body.reference = params.reference;
    if (params.notes) body.notes = params.notes;
    return this.request("POST", "/freights/booking/multi-stops", { body, auth: true });
  }

  // ── Status (public) ───────────────────────────────────────────

  status() {
    return this.request("GET", "/version", { auth: true });
  }
}
