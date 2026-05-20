/**
 * Minimal Shopify Admin API client for reading paid/unfulfilled orders
 * and extracting freight-relevant fields. Auth is per-shop via OAuth access token
 * (saved to ~/.warp/config.json by warp_shopify_connect).
 *
 * Reference: https://shopify.dev/docs/api/admin-rest/2024-01/resources/order
 */
const API_VERSION = "2024-01";
export class ShopifyError extends Error {
    status;
    body;
    constructor(status, body) {
        super(`Shopify ${status}: ${typeof body === "string" ? body : JSON.stringify(body).slice(0, 200)}`);
        this.status = status;
        this.body = body;
        this.name = "ShopifyError";
    }
}
function normalizeShop(shop) {
    let s = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!s.endsWith(".myshopify.com")) {
        s = `${s}.myshopify.com`;
    }
    return s;
}
async function shopifyFetch(shop, accessToken, path) {
    const url = `https://${normalizeShop(shop)}/admin/api/${API_VERSION}${path}`;
    const res = await fetch(url, {
        headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let body = text;
    try {
        body = JSON.parse(text);
    }
    catch { /* keep as text */ }
    if (!res.ok)
        throw new ShopifyError(res.status, body);
    return body;
}
/**
 * Verify the access token by hitting the shop's metadata endpoint.
 * Returns the shop's name and primary domain on success.
 */
export async function verifyShopAuth(shop, accessToken) {
    const data = await shopifyFetch(shop, accessToken, "/shop.json");
    return { name: data.shop.name, domain: data.shop.domain };
}
export async function listPaidUnfulfilled(shop, accessToken, limit = 25) {
    const path = `/orders.json?financial_status=paid&fulfillment_status=unfulfilled&status=open&limit=${Math.min(limit, 250)}`;
    const data = await shopifyFetch(shop, accessToken, path);
    return data.orders.map(summarize);
}
export async function getOrder(shop, accessToken, orderId) {
    const data = await shopifyFetch(shop, accessToken, `/orders/${encodeURIComponent(String(orderId))}.json`);
    return { raw: data.order, summary: summarize(data.order) };
}
/**
 * Find an order by its display name like "#5042" or by raw order_number 5042.
 * Uses the orders.json query param `name`.
 */
export async function findOrderByName(shop, accessToken, nameOrNumber) {
    const query = nameOrNumber.startsWith("#") ? nameOrNumber : `#${nameOrNumber}`;
    const path = `/orders.json?name=${encodeURIComponent(query)}&status=any&limit=1`;
    const data = await shopifyFetch(shop, accessToken, path);
    const order = data.orders?.[0];
    if (!order)
        return null;
    return { raw: order, summary: summarize(order) };
}
export async function markFulfilled(shop, accessToken, orderId, trackingNumber, trackingUrl) {
    const url = `https://${normalizeShop(shop)}/admin/api/${API_VERSION}/orders/${encodeURIComponent(String(orderId))}/fulfillments.json`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
        body: JSON.stringify({
            fulfillment: {
                tracking_number: trackingNumber,
                tracking_company: "Warp",
                tracking_url: trackingUrl ?? `https://tracking.wearewarp.com/${trackingNumber}`,
                notify_customer: true,
            },
        }),
        signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    let body = text;
    try {
        body = JSON.parse(text);
    }
    catch { }
    if (!res.ok)
        throw new ShopifyError(res.status, body);
    return body;
}
function summarize(order) {
    const totalWeightGrams = order.line_items.reduce((sum, item) => sum + item.grams * item.quantity, 0);
    const totalWeightLbs = Math.round((totalWeightGrams / 453.592) * 10) / 10;
    const total = parseFloat(order.total_price);
    return {
        id: order.id,
        name: order.name,
        order_number: order.order_number,
        total_usd: isNaN(total) ? null : total,
        total_weight_lbs: totalWeightLbs,
        destination_zip: order.shipping_address?.zip ?? "",
        destination_city: order.shipping_address?.city ?? "",
        destination_state: order.shipping_address?.province ?? "",
        created_at: order.created_at,
        ships_freight_recommended: totalWeightLbs >= 150,
    };
}
export { normalizeShop };
//# sourceMappingURL=shopify.js.map