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
