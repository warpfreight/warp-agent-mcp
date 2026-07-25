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

  constructor(
    baseUrl: string,
    apiKeyOrGetter?: string | (() => string | undefined),
    getExtraHeaders?: () => Record<string, string>,
  ) {
    this.base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
    if (typeof apiKeyOrGetter === "function") {
      this.getApiKey = apiKeyOrGetter;
    } else {
      const k = apiKeyOrGetter;
      this.getApiKey = () => k;
    }
    if (getExtraHeaders) this.getExtraHeaders = getExtraHeaders;
  }

  /**
   * Optional per-request extra headers, merged into every upstream call
   * (core headers win on conflict). Why this exists: hosted multi-tenant
   * wrappers (warp-mcp-remote) fan MANY end users through ONE egress IP, and
   * warp-site's keyless quote limiter buckets anonymous traffic per IP
   * (quoteRateLimit.ts: 60/hr, keyed on the first x-forwarded-for entry). By
   * passing `() => ({ "x-forwarded-for": <end client IP> })` here, the wrapper
   * gives each end user their own upstream bucket instead of all anonymous
   * users sharing — and exhausting — a single one. No security downgrade: XFF
   * is client-suppliable on the public endpoint anyway; this just makes the
   * honest path attribute correctly. Local/stdio installs never set it.
   */
  private getExtraHeaders: () => Record<string, string> = () => ({});

  /** Sanitized extra headers for THIS request (getter may throw — never let
   *  telemetry-grade headers break a live quote). */
  private extraHeaders(): Record<string, string> {
    try {
      const raw = this.getExtraHeaders() ?? {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string" && v) out[k] = v;
      }
      return out;
    } catch {
      return {};
    }
  }

  private rememberQuote(ids: Array<string | undefined>, ctx: CachedQuote): void {
    for (const id of ids) {
      if (id) this.quoteCtxCache.set(id, ctx);
    }
  }

  private headers(auth: boolean): Record<string, string> {
    const h: Record<string, string> = {
      ...this.extraHeaders(),
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

  // Build the canonical quote-route body from raw tool params. Extracted so
  // both _selfServeQuote and the public ltlMarketOptions wrapper produce
  // identical bodies for the same input.
  private buildQuoteBody(params: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    for (const k of [
      "origin_zip", "destination_zip", "pickup_date",
      "pallets", "weight_lbs_per_pallet", "commodity",
      "freight_class", "hazmat", "stackable",
      "length_in", "width_in", "height_in",
      "pickup_services", "delivery_services",
    ]) { if (params[k] !== undefined) body[k] = params[k]; }
    // Default to a standard 48x40x48 pallet when dims are omitted, so a dims-less
    // quote returns a price (FAK, standard pallet) instead of MISSING_DIMS — the
    // behavior the tools advertise. Callers pass real dims for an exact rate.
    //
    // ⚠ This convenience MUST be disclosed, never presented as fact. warp-site
    // requires dims and 400s MISSING_DIMS without them precisely because LTL
    // prices OFF the dimensions — measured on 90021→60609, 6 plt @800 lb:
    // 48x40x48 = $2,212.10 but 48x40x96 = $6,202.17 (~2.8x) — while the route
    // still reports quote_tier "firm" because, from its side, dims were supplied.
    // Injecting dims here therefore turns an honest "indicative, dims missing"
    // into a confident "firm" on a pallet size WE invented. `_selfServeQuote`
    // below detects that and downgrades + discloses. Van/box-truck/FTL are
    // vehicle-priced (verified: identical rate at 48in and 96in), so the
    // assumption is harmless there and is reported without a tier change.
    if (body.length_in === undefined) body.length_in = 48;
    if (body.width_in === undefined) body.width_in = 40;
    if (body.height_in === undefined) body.height_in = 48;
    const ps = params.pickup_services as string[] | undefined;
    const ds = params.delivery_services as string[] | undefined;
    if ((ps && ps.length) || (ds && ds.length)) {
      body.accessorials = { pickup: ps ?? [], delivery: ds ?? [] };
    }
    return body;
  }

  private async _selfServeQuote(
    mode: "ltl" | "ftl" | "van" | "box-truck",
    params: Record<string, unknown>,
  ): Promise<unknown> {
    // Which dimensions did the CALLER actually give us, vs which did we invent
    // in buildQuoteBody? Read the raw params before the body is built.
    const assumedDimFields = (["length_in", "width_in", "height_in"] as const)
      .filter((k) => !(Number(params[k]) > 0));
    const dimsAssumed = assumedDimFields.length > 0;
    // LTL is the only mode whose price moves with dimensions (van/box-truck/FTL
    // buy a vehicle, so a taller pallet costs the same). Only there does an
    // assumed pallet make the quote genuinely un-firm.
    const dimsAffectPrice = mode === "ltl";
    const key = this.getApiKey();
    const url = `${this.selfServeOrigin}/api/v1/${mode}/quote`;
    const body = this.buildQuoteBody(params);

    const headers: Record<string, string> = { ...this.extraHeaders(), "Content-Type": "application/json" };
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

    // NOTE: market_options (the multi-carrier spread) used to be awaited inline
    // here for LTL — that added ~15s to every LTL quote. Now it's a SEPARATE
    // tool (warp_ltl_market_options) the agent calls as a follow-up, so the
    // Warp rate appears in ~1-2s and the comparison fills in after. The widget
    // uses `loading_market: true` to render skeleton placeholders meanwhile.
    return {
      // Standard MCP quote fields (tools.ts reads these for quoteAmountCache)
      warp_quote_id: quoteId,
      warp_price: priceUsd,
      warp_transit_days: transitDays,
      options: [],
      market_options: [],
      loading_market: mode === "ltl" && hasQuote,
      // Pass self-serve response fields through for warp_book and display
      ...(hasQuote ? {
        quote_id: quoteId,
        price_usd: priceUsd,
        transit_days: transitDays,
        pickup_date: data.pickup_date,
        delivery_date: data.delivery_date,
        expires_at: data.expires_at,
        // A quote priced on dims WE invented is never "firm". Downgrade to the
        // route's own vocabulary ("indicative") and put the assumed dims back on
        // the missing list, so a caller can't read `firm` + `missing_for_ship: []`
        // and present an invented price as settled.
        quote_tier: dimsAssumed && dimsAffectPrice ? "indicative" : data.quote_tier,
        service: data.service,
        assumptions: data.assumptions,
        missing_for_ship: dimsAssumed && dimsAffectPrice
          ? Array.from(new Set([
              ...(Array.isArray(data.missing_for_ship) ? data.missing_for_ship as string[] : []),
              ...assumedDimFields,
            ]))
          : data.missing_for_ship,
        booking_url: data.booking_url,
        book_tool_call: data.book_tool_call,
        payment_ready: data.payment_ready,
      } : {}),
      // Always state whether the pallet size was the caller's or ours.
      dims_assumed: dimsAssumed,
      ...(dimsAssumed ? {
        dims_assumed_fields: assumedDimFields,
        dims_disclosure: dimsAffectPrice
          ? `Priced on an ASSUMED standard 48x40x48 in pallet — ${assumedDimFields.join(", ")} not provided. LTL price is driven by pallet size, especially HEIGHT: a taller pallet can cost several times more on the same lane. Treat this as indicative and send length_in/width_in/height_in for a firm price.`
          : `Dimensions were assumed (standard 48x40x48 in pallet), but ${mode.toUpperCase()} is priced per vehicle, so the rate does not change with pallet size.`,
      } : {}),
      _note: hasQuote
        ? `Warp ${mode.toUpperCase()} quote_id: ${quoteId} — use this id with \`book\` to book${dimsAssumed && dimsAffectPrice ? " (INDICATIVE: pallet dimensions were assumed, not supplied)" : ""}`
        : `No Warp coverage on this lane (${originZip} → ${destZip}). ${data.error ?? ""}`,
    };
  }

  // Public wrapper used by the warp_ltl_market_options tool. Takes raw tool
  // params, normalises to the canonical quote body, and fetches the spread.
  async ltlMarketOptions(params: Record<string, unknown>): Promise<unknown[]> {
    const key = this.getApiKey();
    return this._ltlMarketOptions(this.buildQuoteBody(params), key);
  }

  // Multi-carrier LTL spread for the comparison card. Keyless-capable (server
  // falls back to the house quote account). Slow (~15s) — it polls every carrier.
  private async _ltlMarketOptions(
    body: Record<string, unknown>,
    key: string | undefined,
  ): Promise<unknown[]> {
    const url = `${this.selfServeOrigin}/api/v1/ltl/market-options`;
    const headers: Record<string, string> = { ...this.extraHeaders(), "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body),
      // The carrier poll runs ~17-27s in prod; 22s clipped it intermittently and
      // the card fell back to Warp-only. 30s reliably catches it (route maxDuration
      // is 45s). Still a ceiling — if it ever exceeds this we degrade gracefully.
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    const j = await res.json() as Record<string, unknown>;
    return Array.isArray(j.market_options) ? j.market_options : [];
  }

  /**
   * All four modes in ONE upstream call via the public keyless all-modes
   * endpoint (POST /api/v1/quote). The server fans out to the four mode
   * handlers in-process and returns, per mode: price, transit, quote_tier,
   * assumptions, missing_for_ship, booking_url — and for a mode it can't price,
   * `available: false` plus a `reason`.
   *
   * Preferred over four separate mode calls: one round trip, and the firmness
   * tier / missing_for_ship come from the pricing engine itself instead of being
   * re-derived client-side.
   *
   * Dims are injected when the caller omits them (see buildQuoteBody). That is
   * deliberate here: WITHOUT dims this endpoint drops LTL entirely with
   * "LTL quotes require dimensions", and LTL is usually the cheapest mode — so
   * passing through would quietly quote FTL-only and overstate the price by
   * multiples. We inject to keep LTL in the comparison and report `dims_assumed`
   * so the caller can downgrade the tier and disclose it.
   */
  async allModesQuote(params: Record<string, unknown>): Promise<{
    raw: Record<string, unknown>;
    dimsAssumed: boolean;
    assumedDimFields: string[];
  }> {
    const assumedDimFields = (["length_in", "width_in", "height_in"] as const)
      .filter((k) => !(Number(params[k]) > 0));
    const key = this.getApiKey();
    const headers: Record<string, string> = { ...this.extraHeaders(), "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(`${this.selfServeOrigin}/api/v1/quote`, {
      method: "POST",
      headers,
      body: JSON.stringify(this.buildQuoteBody(params)),
      cache: "no-store",
      // The route fans out to four mode handlers; the slowest dominates. 25s
      // matches the single-mode budget with headroom for the fan-out.
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText);
      throw new WarpApiError(res.status, txt);
    }
    return {
      raw: await res.json() as Record<string, unknown>,
      dimsAssumed: assumedDimFields.length > 0,
      assumedDimFields,
    };
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

  // Batch quote N lanes in parallel — used by warp_batch_quote. Each lane is
  // its own quote-route call (Warp single rate only; no market_options on the
  // batch path). Concurrency is capped so an enormous spreadsheet doesn't
  // hammer the API or saturate node's socket pool.
  async batchQuote(
    lanes: Array<Record<string, unknown>>,
    concurrency = 8,
  ): Promise<Array<{
    row: number;
    ok: boolean;
    mode: string;
    input: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
  }>> {
    const results: Array<{
      row: number; ok: boolean; mode: string; input: Record<string, unknown>;
      result?: Record<string, unknown>; error?: string;
    }> = new Array(lanes.length);
    let next = 0;
    const VALID_MODES = new Set(["ltl", "ftl", "van", "box-truck"]);
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= lanes.length) return;
        const lane = lanes[i];
        const rawMode = typeof lane.mode === "string" ? lane.mode : "ltl";
        const mode = (VALID_MODES.has(rawMode) ? rawMode : "ltl") as "ltl" | "ftl" | "van" | "box-truck";
        // Strip mode from the params we send through (the route doesn't expect it).
        const params: Record<string, unknown> = { ...lane };
        delete params.mode;
        try {
          const result = (await this._selfServeQuote(mode, params)) as Record<string, unknown>;
          results[i] = { row: i + 1, ok: true, mode, input: lane, result };
        } catch (err) {
          results[i] = {
            row: i + 1, ok: false, mode, input: lane,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    };
    const n = Math.max(1, Math.min(concurrency, lanes.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
  }

  // Batch book N already-quoted lanes — used by warp_batch_book. Sequential
  // (concurrency = 1) on purpose: every call charges a real card, so a stale
  // quote or a 402 (no payment method) should abort the rest, not race ahead.
  // Each row may carry its own pickup/delivery, or inherit from the shared
  // defaults the caller passed (FBA case: one warehouse → many destinations).
  // Returns the full per-row outcome (tracking_number / order_id on success,
  // error string on failure) so the tool can render a single progress card.
  async batchBook(
    rows: Array<Record<string, unknown>>,
    shared?: {
      pickup?: Record<string, unknown>;
      delivery?: Record<string, unknown>;
      accessorials?: Record<string, unknown>;
      pickup_window?: Record<string, unknown>;
      delivery_window?: Record<string, unknown>;
      notes?: string;
      reference?: string;
    },
  ): Promise<Array<{
    row: number;
    ok: boolean;
    quote_id: string;
    pickup_zip?: string;
    delivery_zip?: string;
    shipment_number?: string;
    tracking_number?: string;
    order_id?: string;
    booking_url?: string;
    amount_usd?: number;
    raw?: Record<string, unknown>;
    error?: string;
  }>> {
    const results: Array<{
      row: number; ok: boolean; quote_id: string;
      pickup_zip?: string; delivery_zip?: string;
      shipment_number?: string; tracking_number?: string; order_id?: string;
      booking_url?: string; amount_usd?: number;
      raw?: Record<string, unknown>; error?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const quoteId = String(row.quote_id ?? "");
      // Merge per-row over shared. Per-row wins when present.
      const pickup   = (row.pickup   ?? shared?.pickup)   as Record<string, unknown> | undefined;
      const delivery = (row.delivery ?? shared?.delivery) as Record<string, unknown> | undefined;
      const body: Record<string, unknown> = {
        quote_id: quoteId,
        ...(pickup        ? { pickup } : {}),
        ...(delivery      ? { delivery } : {}),
        ...(row.notes     ?? shared?.notes     ? { notes:     row.notes     ?? shared?.notes }     : {}),
        ...(row.reference ?? shared?.reference ? { reference: row.reference ?? shared?.reference } : {}),
        ...(row.accessorials    ?? shared?.accessorials    ? { accessorials:    row.accessorials    ?? shared?.accessorials    } : {}),
        ...(row.pickup_window   ?? shared?.pickup_window   ? { pickup_window:   row.pickup_window   ?? shared?.pickup_window   } : {}),
        ...(row.delivery_window ?? shared?.delivery_window ? { delivery_window: row.delivery_window ?? shared?.delivery_window } : {}),
      };

      const pickupZip   = pickup   && typeof pickup.zipCode   === "string" ? pickup.zipCode   as string : undefined;
      const deliveryZip = delivery && typeof delivery.zipCode === "string" ? delivery.zipCode as string : undefined;

      try {
        const data = await this.book(body) as Record<string, unknown>;
        results.push({
          row: i + 1,
          ok: true,
          quote_id: quoteId,
          pickup_zip: pickupZip,
          delivery_zip: deliveryZip,
          // /api/v1/book returns snake_case. The S- shipment number is the
          // public tracking key (tracking.wearewarp.com/S-…); order_number is
          // the P- order ref shown for reconciliation, not the tracking key.
          // (The previous camelCase reads — data.trackingNumber / data.orderId —
          // never matched the snake_case response, so every row came back blank.)
          shipment_number: typeof data.shipment_number === "string" ? data.shipment_number
                         : typeof data.tracking_number === "string" ? data.tracking_number : undefined,
          tracking_number: typeof data.tracking_number === "string" ? data.tracking_number
                         : typeof data.shipment_number === "string" ? data.shipment_number : undefined,
          order_id:        typeof data.order_number    === "string" ? data.order_number
                         : typeof data.order_id        === "string" ? data.order_id        : undefined,
          booking_url:     typeof data.booking_url      === "string" ? data.booking_url
                         : typeof data.tracking_dashboard === "string" ? data.tracking_dashboard : undefined,
          amount_usd:      typeof data.amount_usd       === "number" ? data.amount_usd       : undefined,
          raw: data,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          row: i + 1,
          ok: false,
          quote_id: quoteId,
          pickup_zip: pickupZip,
          delivery_zip: deliveryZip,
          error: msg,
        });
        // 402 / no-payment errors are not row-specific — they'll fail every
        // remaining row too. Bail out and surface them all as "skipped — see
        // row N error" so the user fixes the card once instead of seeing N
        // identical failures.
        if (/no payment|payment method|card on file|402/i.test(msg)) {
          for (let j = i + 1; j < rows.length; j++) {
            results.push({
              row: j + 1,
              ok: false,
              quote_id: String(rows[j].quote_id ?? ""),
              error: `Skipped after row ${i + 1} failure (no payment method on file).`,
            });
          }
          break;
        }
      }
    }

    return results;
  }

  // ── Self-serve account helpers (saved locations + load templates) ──
  // Hit the warp-site self-serve routes directly with Bearer auth, like quote/book
  // (NOT the /warp gw proxy that `request()` uses).
  private async _selfServe(
    method: "GET" | "POST" | "DELETE",
    path: string,
    opts?: { body?: unknown; query?: Record<string, string> },
  ): Promise<unknown> {
    const key = this.getApiKey();
    let url = `${this.selfServeOrigin}${path}`;
    if (opts?.query) url += `?${new URLSearchParams(opts.query).toString()}`;
    const headers: Record<string, string> = { ...this.extraHeaders(), "Content-Type": "application/json" };
    if (key) headers["Authorization"] = `Bearer ${key}`;
    const res = await fetch(url, {
      method,
      headers,
      body: opts?.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(25000),
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    if (!res.ok) throw new WarpApiError(res.status, json);
    return json;
  }

  /** GET /api/v1/locations — the agent's saved pickup/delivery locations. */
  async getLocations() {
    return this._selfServe("GET", "/api/v1/locations");
  }

  /** GET /api/v1/load_templates — the agent's saved reusable load configs. */
  async getLoadTemplates() {
    return this._selfServe("GET", "/api/v1/load_templates");
  }

  /** POST /api/v1/load_templates — save a reusable load config. */
  async saveLoadTemplate(params: Record<string, unknown>) {
    return this._selfServe("POST", "/api/v1/load_templates", { body: params });
  }

  /** DELETE /api/v1/load_templates?id=lt_... — remove a saved load config. */
  async deleteLoadTemplate(id: string) {
    return this._selfServe("DELETE", "/api/v1/load_templates", { query: { id } });
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

    const headers: Record<string, string> = { ...this.extraHeaders(), "Content-Type": "application/json" };
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
  // Routes through the canonical public endpoints (POST /api/v1/multistop/
  // {quote,book}) which translate snake_case to the gateway dialect
  // server-side (exact-lowercase `zipcode`, vehicle_type wrapped to the
  // verified { code } object). Field reference: /api/v1/openapi.json,
  // operationIds multistopQuote / multistopBook. The previous implementation
  // posted the raw gateway paths through the /warp proxy with bodies the
  // gateway validator rejects (book sent { quoteId, stops } — the gateway
  // requires { quoteId, shipments[] } legs).

  multistopQuote(params: Record<string, unknown>) {
    const pallets = Math.max(1, Number(params.pallets ?? 1));
    const totalWeight = Number(params.total_weight_lbs ?? pallets * 500);
    const stopZips = (params.stop_zips as string[] | undefined) ?? [];
    const body: Record<string, unknown> = {
      pickup_date: params.pickup_date,
      pickup_info: { zipcode: params.pickup_zip },
      transits: stopZips.map((zip) => ({ zipcode: zip })),
      delivery_info: { zipcode: params.delivery_zip },
      list_items: [{
        name: "Freight",
        quantity: pallets,
        packaging: "pallet",
        total_weight: totalWeight,
        weight_unit: "lbs",
        length: 48, width: 40, height: 48, size_unit: "IN",
        stackable: false,
      }],
      // Optional to the validator but required in practice — without a
      // vehicle the gateway answers "A rate has not yet been determined".
      vehicle_type: (params.vehicle_type as string | undefined) || "DRY_VAN_53",
      shipment_type: "FTL",
    };
    return this._selfServe("POST", "/api/v1/multistop/quote", { body });
  }

  multistopBook(params: Record<string, unknown>) {
    // One shipments[] leg per pickup→delivery pair (gateway minimum 2), each
    // { pickup_info{stop_index, address, window_time}, delivery_info{…},
    // list_items[] }. tools.ts builds the legs; this is a passthrough.
    return this._selfServe("POST", "/api/v1/multistop/book", {
      body: { quote_id: params.quote_id, shipments: params.shipments },
    });
  }

  // ── Status (public) ───────────────────────────────────────────

  status() {
    return this.request("GET", "/version", { auth: true });
  }
}
