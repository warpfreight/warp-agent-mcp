import { MCP_APP_MIME_TYPE } from "./quote-card.js";
export declare const BATCH_BOOK_CARD_RESOURCE_URI = "ui://warp/batch-book-card";
export declare const BATCH_BOOK_CARD_MCP_RESOURCE_URI = "ui://warp/batch-book-card.mcp";
export interface BatchBookRow {
    row: number;
    ok: boolean;
    quote_id: string;
    pickup_zip: string;
    delivery_zip: string;
    tracking_number: string;
    order_id: string;
    tracking_url: string;
    booking_url: string;
    amount_usd: number;
    error: string;
}
export interface BatchBookWidgetData {
    type: "batch_book";
    total: number;
    succeeded: number;
    failed: number;
    total_amount_usd: number;
    rows: BatchBookRow[];
}
/**
 * Map the client.batchBook() result array into the widget shape.
 */
export declare function toBatchBookWidgetData(raw: Array<{
    row: number;
    ok: boolean;
    quote_id: string;
    pickup_zip?: string;
    delivery_zip?: string;
    tracking_number?: string;
    order_id?: string;
    booking_url?: string;
    amount_usd?: number;
    raw?: Record<string, unknown>;
    error?: string;
}>): BatchBookWidgetData | null;
export declare function renderBatchBookCard(data: BatchBookWidgetData): string;
export declare function batchBookCardTemplate(): string;
export declare function batchBookCardMcpTemplate(): string;
export { MCP_APP_MIME_TYPE };
