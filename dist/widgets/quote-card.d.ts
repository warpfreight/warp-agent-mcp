export type QuoteMode = "van" | "box-truck" | "ftl" | "ltl";
export interface QuoteWidgetData {
    quote_id: string;
    mode: QuoteMode;
    rate_usd: number;
    origin_zip: string;
    destination_zip: string;
    pallets: number;
    pickup_date: string;
    delivery_date: string;
    transit_days: number;
    expires_at: string;
    vehicle_label: string;
    payment_ready: boolean;
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
