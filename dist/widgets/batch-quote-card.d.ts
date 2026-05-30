import { MCP_APP_MIME_TYPE } from "./quote-card.js";
export declare const BATCH_QUOTE_CARD_RESOURCE_URI = "ui://warp/batch-quote-card";
export declare const BATCH_QUOTE_CARD_MCP_RESOURCE_URI = "ui://warp/batch-quote-card.mcp";
export type BatchLaneMode = "ltl" | "ftl" | "van" | "box-truck";
export interface BatchLaneRow {
    row: number;
    ok: boolean;
    mode: BatchLaneMode;
    origin_zip: string;
    destination_zip: string;
    pickup_date: string;
    pallets: number;
    weight_lbs_per_pallet: number;
    commodity: string;
    quote_id: string;
    price_usd: number;
    per_pallet: number;
    transit_days: number;
    delivery_date: string;
    expires_at: string;
    error: string;
}
export interface BatchQuoteWidgetData {
    type: "batch_quote";
    total: number;
    succeeded: number;
    failed: number;
    lanes: BatchLaneRow[];
}
/**
 * Map the client.batchQuote() result array into the widget shape.
 */
export declare function toBatchQuoteWidgetData(raw: Array<{
    row: number;
    ok: boolean;
    mode: string;
    input: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: string;
}>): BatchQuoteWidgetData | null;
export declare function renderBatchQuoteCard(data: BatchQuoteWidgetData): string;
export declare function batchQuoteCardTemplate(): string;
export declare function batchQuoteCardMcpTemplate(): string;
export { MCP_APP_MIME_TYPE };
