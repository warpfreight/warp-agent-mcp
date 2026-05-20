/**
 * WarpClient for MCP — direct against gw.wearewarp.com.
 * Auth: apikey header (same key as customer.wearewarp.com/dashboard/developer).
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
    constructor(baseUrl: string, apiKeyOrGetter?: string | (() => string | undefined));
    private rememberQuote;
    private headers;
    private request;
    vanQuote(params: Record<string, unknown>): Promise<{
        warp_quote_id: string | null;
        warp_price: {} | null;
        warp_transit_days: {} | null;
        options: Record<string, unknown>[];
        _items: unknown[];
        _note: string;
    } | {
        warp_quote_id: string | null;
        warp_price: number | null;
        warp_transit_days: number | null;
        options: {
            source: {};
            id: {};
            carrierName: {};
            transitTime: number;
            rate: number;
            serviceLevel: {};
            shipmentType: string;
        }[];
        _note: string;
    }>;
    boxTruckQuote(params: Record<string, unknown>): Promise<{
        warp_quote_id: string | null;
        warp_price: {} | null;
        warp_transit_days: {} | null;
        options: Record<string, unknown>[];
        _items: unknown[];
        _note: string;
    } | {
        warp_quote_id: string | null;
        warp_price: number | null;
        warp_transit_days: number | null;
        options: {
            source: {};
            id: {};
            carrierName: {};
            transitTime: number;
            rate: number;
            serviceLevel: {};
            shipmentType: string;
        }[];
        _note: string;
    }>;
    ftlQuote(params: Record<string, unknown>): Promise<{
        warp_quote_id: string | null;
        warp_price: number | null;
        warp_transit_days: number | null;
        options: {
            source: {};
            id: {};
            carrierName: {};
            transitTime: number;
            rate: number;
            serviceLevel: {};
            shipmentType: string;
        }[];
        _note: string;
    }>;
    private _dualQuote;
    ltlQuote(params: Record<string, unknown>, _originZip?: string, _destZip?: string): Promise<{
        warp_quote_id: string | null;
        warp_price: {} | null;
        warp_transit_days: {} | null;
        options: Record<string, unknown>[];
        _items: unknown[];
        _note: string;
    } | {
        warp_quote_id: string | null;
        warp_price: number | null;
        warp_transit_days: number | null;
        options: {
            source: {};
            id: {};
            carrierName: {};
            transitTime: number;
            rate: number;
            serviceLevel: {};
            shipmentType: string;
        }[];
        _note: string;
    }>;
    private _publicQuote;
    private _oldLtlQuote;
    _deadcode(params: Record<string, unknown>): Promise<unknown>;
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
    book(params: Record<string, unknown>): Promise<unknown>;
    listBookings(limit?: number): Promise<unknown>;
    track(shipmentId: string): Promise<unknown>;
    cancel(params: Record<string, unknown>): Promise<unknown>;
    events(shipmentId: string): Promise<unknown>;
    invoice(orderId: string): Promise<unknown>;
    documents(orderId: string): Promise<unknown>;
    quoteHistory(): Promise<unknown>;
    laneHistory(): Promise<unknown>;
    rateCard(): Promise<unknown>;
    multistopQuote(params: Record<string, unknown>): Promise<unknown>;
    multistopBook(params: Record<string, unknown>): Promise<unknown>;
    status(): Promise<unknown>;
}
