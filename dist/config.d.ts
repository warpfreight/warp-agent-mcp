/**
 * Read / merge / write ~/.warp/config.json.
 *
 * Config is shared across the CLI and MCP. New fields are merged in without
 * clobbering existing ones, so warp_login + warp_shopify_connect + warp_slack_connect
 * can each write their own slice without overwriting the API key.
 */
export interface ShopifyShopConfig {
    access_token: string;
    connected_at: string;
}
export interface PickupAddress {
    company?: string;
    contact_name: string;
    phone: string;
    email: string;
    street: string;
    city: string;
    state: string;
    zip_code: string;
}
export interface WarpConfig {
    api_key?: string;
    email?: string;
    shopify_shops?: Record<string, ShopifyShopConfig>;
    slack_webhook?: string;
    default_pickup?: PickupAddress;
}
export declare function readConfig(): WarpConfig;
export declare function writeConfig(patch: Partial<WarpConfig>): WarpConfig;
