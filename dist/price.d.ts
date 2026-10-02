/**
 * price_check: is a price good FOR THIS ACCOUNT, judged only by what the
 * account itself paid on the same lane and mode. No market data, no guesses:
 * every number in the answer comes from the account's own bookings, and the
 * answer says how many bookings it rests on. Too few comparables = "no basis",
 * never a verdict.
 */
export type BookingRow = {
    mode?: unknown;
    origin_zip?: unknown;
    destination_zip?: unknown;
    pallet_count?: unknown;
    price_usd?: unknown;
    status?: unknown;
    booked_at?: unknown;
    cancelled_at?: unknown;
    shipment_number?: unknown;
};
export type PriceQuery = {
    mode: string;
    origin_zip: string;
    destination_zip: string;
    price_usd: number;
    pallets?: number;
    window_days?: number;
    now?: number;
};
export declare function normMode(m: unknown): string;
export declare const MIN_COMPARABLES = 2;
export declare const IN_LINE_PCT = 5;
export declare function priceContext(rows: BookingRow[], q: PriceQuery): {
    verdict: "no_basis";
    comparable_bookings: number;
    lane: string;
    mode: string;
    window_days: number;
    note: string;
    delta_pct?: undefined;
    unit?: undefined;
    this_price?: undefined;
    usual_median?: undefined;
    usual_low?: undefined;
    usual_high?: undefined;
    basis?: undefined;
    recent?: undefined;
} | {
    verdict: string;
    delta_pct: number;
    unit: string;
    this_price: number;
    usual_median: number;
    usual_low: number;
    usual_high: number;
    comparable_bookings: number;
    basis: "exact_zip" | "zip3_area";
    lane: string;
    mode: string;
    window_days: number;
    recent: {
        booked_at: string;
        price_usd: number;
        pallets: number | null;
        shipment: {} | null;
    }[];
    note: string;
};
