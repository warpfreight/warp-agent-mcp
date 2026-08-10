/**
 * WarpClient for MCP — routes quotes and booking through the Warp self-serve
 * API endpoints (www.wearewarp.com/api/v1/{mode}/quote, /api/v1/book).
 * Auth: Bearer wak_live_* or wak_test_* key.
 */
export declare class WarpApiError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown);
}
export declare class WarpClient {
    private base;
    private getApiKey;
    /**
     * Quote-context cache, keyed by quote_id (Warp PRICING_… and every market
     * option id). Populated whenever a quote runs; consulted by book() so the
     * atomic /freight/book call can be reconstructed (pallets, weight, pickup
     * date) without the caller re-supplying freight details that the quote
     * already pinned down.
     */
    private quoteCtxCache;
    constructor(baseUrl: string, apiKeyOrGetter?: string | (() => string | undefined), getExtraHeaders?: () => Record<string, string>);
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
    private getExtraHeaders;
    /** Sanitized extra headers for THIS request (getter may throw — never let
     *  telemetry-grade headers break a live quote). */
    private extraHeaders;
    private rememberQuote;
    private headers;
    private request;
    /**
     * Route a quote through the warp-site self-serve API endpoints
     * (www.wearewarp.com/api/v1/{mode}/quote). These use the working upstream
     * public search endpoint and accept Bearer wak_live_* / wak_test_* auth.
     * After Troy's next.config.ts rewrite cutover, /api/v1/* on warp-site will
     * proxy to warp-freight-api.vercel.app — no MCP change needed at that point.
     */
    private get selfServeOrigin();
    private buildQuoteBody;
    private _selfServeQuote;
    ltlMarketOptions(params: Record<string, unknown>): Promise<unknown[]>;
    private _ltlMarketOptions;
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
    allModesQuote(params: Record<string, unknown>): Promise<{
        raw: Record<string, unknown>;
        dimsAssumed: boolean;
        assumedDimFields: string[];
    }>;
    vanQuote(params: Record<string, unknown>): Promise<unknown>;
    boxTruckQuote(params: Record<string, unknown>): Promise<unknown>;
    ftlQuote(params: Record<string, unknown>): Promise<unknown>;
    ltlQuote(params: Record<string, unknown>, _originZip?: string, _destZip?: string): Promise<unknown>;
    batchQuote(lanes: Array<Record<string, unknown>>, concurrency?: number): Promise<Array<{
        row: number;
        ok: boolean;
        mode: string;
        input: Record<string, unknown>;
        result?: Record<string, unknown>;
        error?: string;
    }>>;
    batchBook(rows: Array<Record<string, unknown>>, shared?: {
        pickup?: Record<string, unknown>;
        delivery?: Record<string, unknown>;
        accessorials?: Record<string, unknown>;
        pickup_window?: Record<string, unknown>;
        delivery_window?: Record<string, unknown>;
        notes?: string;
        reference?: string;
    }): Promise<Array<{
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
    }>>;
    private _selfServe;
    /** GET /api/v1/locations — the agent's saved pickup/delivery locations. */
    getLocations(): Promise<unknown>;
    /** GET /api/v1/load_templates — the agent's saved reusable load configs. */
    getLoadTemplates(): Promise<unknown>;
    /** POST /api/v1/load_templates — save a reusable load config. */
    saveLoadTemplate(params: Record<string, unknown>): Promise<unknown>;
    /** DELETE /api/v1/load_templates?id=lt_... — remove a saved load config. */
    deleteLoadTemplate(id: string): Promise<unknown>;
    /** POST /api/v1/automations — propose a recurring lane (owner approval required). */
    proposeAutomation(params: Record<string, unknown>): Promise<unknown>;
    /** GET /api/v1/automations?token= — status of an automation this account proposed. */
    automationStatus(token: string): Promise<unknown>;
    /** POST /api/v1/automations/manage — stop-only lifecycle: pause | cancel | skip_next. */
    manageAutomation(token: string, action: string): Promise<unknown>;
    /** GET /api/v1/automations/receipts?token= — per-booking authorization record. */
    automationReceipts(token: string): Promise<unknown>;
    /**
     * Book a quoted shipment via the self-serve /api/v1/book endpoint.
     * Atomic: Stripe charge + gw.wearewarp.com booking in one server-side call.
     * tools.ts no longer pre-charges via /agents/charge-me — payment is handled
     * internally by /api/v1/book using the agent\'s saved card.
     */
    book(params: Record<string, unknown>): Promise<unknown>;
    listBookings(limit?: number): Promise<unknown>;
    track(shipmentId: string): Promise<unknown>;
    cancel(params: Record<string, unknown>): Promise<unknown>;
    events(shipmentId: string): Promise<unknown>;
    invoice(orderId: string): Promise<unknown>;
    documents(orderId: string, type?: string): Promise<unknown>;
    quoteHistory(): Promise<unknown>;
    laneHistory(): Promise<unknown>;
    rateCard(): Promise<unknown>;
    multistopQuote(params: Record<string, unknown>): Promise<unknown>;
    multistopBook(params: Record<string, unknown>): Promise<unknown>;
    status(): Promise<unknown>;
}
