/**
 * WarpClient for MCP — routes quotes and booking through the Warp self-serve
 * API endpoints (www.wearewarp.com/api/v1/{mode}/quote, /api/v1/book).
 * Auth: Bearer wak_live_* or wak_test_* key.
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
      signal: AbortSignal.timeout(25000),
    });

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok) throw new WarpApiError(res.status, json);
    return json;
  }

  // ── Quote (self-serve API) ─────────────────────────────────────

  /**
   * Route a quote through the warp-site self-serve API endpoints
   * (www.wearewarp.com/api/v1/{mode}/quote). These use the working upstream
   * public search endpoint and accept Bearer wak_live_* / wak_test_* auth.
   * After Troy's next.config.ts rewrite cutover, /api/v1/* on warp-site will
   * proxy to warp-freight-api.vercel.app — no MCP change needed at that point.
   */
  private get selfServeOrigin(): string {
    try { return new URL(this.base).origin; } catch { return "https://www.wearewarp.com"; }
  }

  private async _selfServeQuote(
    mode: "ltl" | "ftl" | "van" | "box-truck",
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const key = this.getApiKey();
    const url = `${this.selfServeOrigin}/api/v1/${mode}/quote`;

    // Forward all recognised params; the route ignores unknowns
    const body: Record<string, unknown> = {};
    for (const k of [
      "origin_zip", "destination_zip", "pickup_date",
      "pallets", "weight_lbs_per_pallet", "commodity",
      "freight_class", "hazmat", "stackable",
      "length_in", "width_in", "height_in",
      "pickup_services", "delivery_services",
    ]) { if (params[k] !== undefined) body[k] = params[k]; }

    // The quote route reads accessorials as body.accessorials {pickup, delivery}
    // (same shape as /book), not the flat pickup_services/delivery_services keys.
    // Build it so accessorials reach + are stored on the quote — otherwise gw
    // rejects a later booking with "BookingData and quoteInfo must be the same
    // pickupServices."
    const ps = params.pickup_services as string[] | undefined;
    const ds = params.delivery_services as string[] | undefined;
    if ((ps && ps.length) || (ds && ds.length)) {
      body.accessorials = { pickup: ps ?? [], delivery: ds ?? [] };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;

    const res = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new WarpApiError(res.status, txt);
    }

    const data = await res.json() as Record<string, unknown>;
    const quoteId = data.quote_id as string | null ?? null;
    const priceUsd = data.price_usd as number | null ?? null;
    const transitDays = data.transit_days as number | null ?? null;
    const hasQuote = !!quoteId;

    // Cache context so book() can reference it without re-quoting
    if (hasQuote) {
      this.rememberQuote([quoteId!], {
        items: [],
        pickupDate: params.pickup_date as string | undefined,
        pallets: params.pallets as number | undefined,
        weightPerPallet: params.weight_lbs_per_pallet as number | undefined,
      });
    }

    const originZip = String(params.origin_zip ?? "");
    const destZip = String(params.destination_zip ?? "");

    // For LTL, also pull the multi-carrier spread (~20 carriers, ~15s) so the
    // quote card can render the full comparison. Non-fatal: on failure/timeout
    // the card falls back to the single Warp option. Other modes stay single-rate.
    let marketOptions: unknown[] = [];
    if (mode === "ltl" && hasQuote) {
      try { marketOptions = await this._ltlMarketOptions(body, key); } catch { /* non-fatal */ }
    }

    return {
      // Standard MCP quote fields (tools.ts reads these for quoteAmountCache)
      warp_quote_id: quoteId,
      warp_price: priceUsd,
      warp_transit_days: transitDays,
      options: [],
      market_options: marketOptions,
      // Pass self-serve response fields through for warp_book and display
      ...(hasQuote ? {
        quote_id: quoteId,
        price_usd: priceUsd,
        transit_days: transitDays,
        pickup_date: data.pickup_date,
        delivery_date: data.delivery_date,
        expires_at: data.expires_at,
        quote_tier: data.quote_tier,
        service: data.service,
        assumptions: data.assumptions,
        missing_for_ship: data.missing_for_ship,
        booking_url: data.booking_url,
        book_tool_call: data.book_tool_call,
        payment_ready: data.payment_ready,
      } : {}),
      _note: hasQuote
        ? `Warp ${mode.toUpperCase()} quote_id: ${quoteId} — use this id with warp_book to book`
        : `No Warp coverage on this lane (${originZip} → ${destZip}). ${data.error ?? ""}`,
    };
  }

  // Multi-carrier LTL spread for the comparison card. Keyless-capable (server
  // falls back to the house quote account). Slow (~15s) — it polls every carrier.
  private async _ltlMarketOptions(
    body: Record<string, unknown>,
    key: string | undefined,
  ): Promise<unknown[]> {
    const url = `${this.selfServeOrigin}/api/v1/ltl/market-options`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) return [];
    const j = await res.json() as Record<string, unknown>;
    return Array.isArray(j.market_options) ? j.market_options : [];
  }

  async vanQuote(params: Record<string, unknown>) {
    return this._selfServeQuote("van", params);
  }

  async boxTruckQuote(params: Record<string, unknown>) {
    return this._selfServeQuote("box-truck", params);
  }

  async ftlQuote(params: Record<string, unknown>) {
    // Previously called gw.wearewarp.com/api/v1/p/customer-cli/freight-quote/search
    // directly (404 as of 2026-05). Now routes through self-serve API like all modes.
    return this._selfServeQuote("ftl", params);
  }

  async ltlQuote(params: Record<string, unknown>, _originZip?: string, _destZip?: string) {
    return this._selfServeQuote("ltl", params);
  }

    // ── Booking (auth) ────────────────────────────────────────────

  /**
   * Book a quoted shipment via the self-serve /api/v1/book endpoint.
   * Atomic: Stripe charge + gw.wearewarp.com booking in one server-side call.
   * tools.ts no longer pre-charges via /agents/charge-me — payment is handled
   * internally by /api/v1/book using the agent\'s saved card.
   */
  async book(params: Record<string, unknown>) {
    const key = this.getApiKey();
    const url = `${this.selfServeOrigin}/api/v1/book`;

    const pickup  = params.pickup   as Record<string, unknown> | undefined;
    const delivery = params.delivery as Record<string, unknown> | undefined;

    // Body shape per openapi.json + the live /api/v1/book route: snake_case
    // `quote_id`, addresses nested under `patch.{pickup,delivery}` using the
    // addressSchema field names (zipCode, contactName, …), `reference` top-level,
    // `notes` under patch. The previous shape (quoteId / top-level pickup / zip+
    // contact) silently failed every booking with INVALID_QUOTE_ID.
    const mapAddr = (addr: Record<string, unknown>) => ({
      zipCode:     addr.zipCode ?? addr.zip,
      city:        addr.city,
      state:       addr.state,
      street:      addr.street,
      contactName: addr.contactName ?? addr.contact,
      phone:       addr.phone,
      email:       addr.email,
      ...(addr.specialInstruction ? { specialInstruction: addr.specialInstruction } : {}),
      ...(addr.company ? { company: addr.company } : {}),
    });

    const body: Record<string, unknown> = { quote_id: params.quote_id };
    const patch: Record<string, unknown> = {};
    if (pickup)        patch.pickup   = mapAddr(pickup);
    if (delivery)      patch.delivery = mapAddr(delivery);
    if (params.notes)  patch.notes    = params.notes;
    if (Object.keys(patch).length > 0) body.patch = patch;
    if (params.reference) body.reference = params.reference;
    // Top-level per the /api/v1/book contract: accessorials {pickup[],delivery[]}
    // and optional pickup_window/delivery_window ({from,to} as HH:MM).
    if (params.accessorials)    body.accessorials    = params.accessorials;
    if (params.pickup_window)   body.pickup_window   = params.pickup_window;
    if (params.delivery_window) body.delivery_window = params.delivery_window;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;

    const res = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });

    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new WarpApiError(res.status, json);
    return json;
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

  documents(orderId: string, type?: string) {
    // Bao (Warp backend, 2026-05): the freight API now returns EXTERNAL /
    // brokered carrier BOLs via ?type=bol on this endpoint. Pass the type
    // through so callers can pull the Bill of Lading for market-carrier
    // bookings (which previously had no API-accessible BOL).
    const q = type ? `?type=${encodeURIComponent(type)}` : "";
    return this.request("GET", `/freights/documents/${encodeURIComponent(orderId)}${q}`, { auth: true });
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
