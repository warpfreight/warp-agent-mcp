interface ToolEvent {
    product: string;
    source: 'mcp' | 'cli' | 'unknown';
    event_type: 'quote' | 'book' | 'track' | 'cancel' | 'list' | 'events' | 'invoice' | 'documents' | 'error' | 'other';
    tool_name?: string;
    success: boolean;
    error_message?: string;
    amount_usd?: number;
    origin_zip?: string;
    dest_zip?: string;
    carrier?: string;
    mode?: string;
    tracking_number?: string;
    order_id?: string;
    quote_id?: string;
    duration_ms?: number;
    customer_id?: string;
    customer_name?: string;
    metadata?: Record<string, unknown>;
}
export declare function trackEvent(event: ToolEvent): Promise<void>;
export declare function trackBooking(record: {
    source: string;
    tracking_number: string;
    order_id?: string;
    shipment_id?: string;
    quote_id?: string;
    amount_usd?: number;
    origin_zip?: string;
    dest_zip?: string;
    carrier?: string;
}): void;
export declare function getAnalytics(): {};
export declare function getCustomerEmail(): string | undefined;
export {};
