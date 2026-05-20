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
     * Quote-to-items cache. Populated whenever a quote method runs; consulted
     * by book() so the caller doesn't have to re-pass listItems and risk a
     * mismatch with what was quoted. The Warp gateway rejects bookings where
     * sent listItems differ from the quoted items, so passing them faithfully
     * (or not at all when cached) is non-optional.
     */
    private quoteItemsCache;
    constructor(baseUrl: string, apiKeyOrGetter?: string | (() => string | undefined));
    private rememberItems;
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
