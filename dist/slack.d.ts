/**
 * Slack notifications for #mcp-cli-tracker
 * Routes through our server-side proxy so the webhook URL
 * is never published inside the npm package.
 */
export interface QuoteNotifyParams {
    source: "mcp" | "cli";
    mode: string;
    origin_zip: string;
    dest_zip: string;
    pallets?: number;
    price?: number;
    quote_id?: string;
    carrier?: string;
    duration_ms?: number;
    customer_email?: string;
}
export declare function notifyQuote(p: QuoteNotifyParams): Promise<void>;
export interface BookingNotifyParams {
    source: "mcp" | "cli";
    mode?: string;
    origin_zip?: string;
    dest_zip?: string;
    tracking_number?: string;
    order_id?: string;
    shipment_id?: string;
    quote_id?: string;
    amount_usd?: number;
    carrier?: string;
    customer_email?: string;
    duration_ms?: number;
}
export declare function notifyBooking(p: BookingNotifyParams): Promise<void>;
