/**
 * Minimal Shopify Admin API client for reading paid/unfulfilled orders
 * and extracting freight-relevant fields. Auth is per-shop via OAuth access token
 * (saved to ~/.warp/config.json by warp_shopify_connect).
 *
 * Reference: https://shopify.dev/docs/api/admin-rest/2024-01/resources/order
 */
export interface ShopifyLineItem {
    id: number;
    title: string;
    quantity: number;
    grams: number;
    sku?: string;
}
export interface ShopifyAddress {
    zip: string;
    city: string;
    province: string;
    country_code: string;
    address1: string;
    name: string;
    phone?: string;
}
export interface ShopifyOrder {
    id: number;
    name: string;
    order_number: number;
    email?: string;
    financial_status: string;
    fulfillment_status: string | null;
    total_price: string;
    currency: string;
    created_at: string;
    shipping_address?: ShopifyAddress;
    line_items: ShopifyLineItem[];
}
export interface ShopifyOrderSummary {
    id: number;
    name: string;
    order_number: number;
    total_usd: number | null;
    total_weight_lbs: number;
    destination_zip: string;
    destination_city: string;
    destination_state: string;
    created_at: string;
    ships_freight_recommended: boolean;
}
export declare class ShopifyError extends Error {
    status: number;
    body: unknown;
    constructor(status: number, body: unknown);
}
declare function normalizeShop(shop: string): string;
/**
 * Verify the access token by hitting the shop's metadata endpoint.
 * Returns the shop's name and primary domain on success.
 */
export declare function verifyShopAuth(shop: string, accessToken: string): Promise<{
    name: string;
    domain: string;
}>;
export declare function listPaidUnfulfilled(shop: string, accessToken: string, limit?: number): Promise<ShopifyOrderSummary[]>;
export declare function getOrder(shop: string, accessToken: string, orderId: number | string): Promise<{
    raw: ShopifyOrder;
    summary: ShopifyOrderSummary;
}>;
/**
 * Find an order by its display name like "#5042" or by raw order_number 5042.
 * Uses the orders.json query param `name`.
 */
export declare function findOrderByName(shop: string, accessToken: string, nameOrNumber: string): Promise<{
    raw: ShopifyOrder;
    summary: ShopifyOrderSummary;
} | null>;
export declare function markFulfilled(shop: string, accessToken: string, orderId: number | string, trackingNumber: string, trackingUrl?: string): Promise<unknown>;
export { normalizeShop };
