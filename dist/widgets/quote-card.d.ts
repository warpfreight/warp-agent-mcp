export type QuoteMode = "van" | "box-truck" | "ftl" | "ltl";
export interface MarketplaceOption {
    carrier_name: string;
    rate_usd: number;
    per_pallet: number;
    transit_days: number;
    service_level?: string;
}
export interface QuoteWidgetData {
    type: "quote";
    mode: QuoteMode;
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    expires_at: string;
    booking_url: string;
    warp: {
        quote_id: string;
        rate_usd: number;
        per_pallet: number;
        transit_days: number;
        delivery_date: string;
        vehicle_label: string;
        on_time_pct: number;
        payment_ready: boolean;
    };
    marketplace: MarketplaceOption[];
    warp_count: number;
    marketplace_count: number;
}
export declare const QUOTE_CARD_RESOURCE_URI = "ui://warp/quote-card";
export declare const QUOTE_CARD_MCP_RESOURCE_URI = "ui://warp/quote-card.mcp";
export declare const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
export declare function toWidgetData(mode: QuoteMode, input: {
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets?: number;
}, response: Record<string, unknown>): QuoteWidgetData | null;
export declare function renderQuoteCard(data: QuoteWidgetData): string;
export declare function quoteCardTemplate(): string;
export declare function quoteCardMcpTemplate(): string;
