import { MCP_APP_MIME_TYPE } from "./quote-card.js";
export declare const BOOKINGS_CARD_RESOURCE_URI = "ui://warp/bookings-card";
export declare const BOOKINGS_CARD_MCP_RESOURCE_URI = "ui://warp/bookings-card.mcp";
export declare const TRACKING_BASE_URL = "https://tracking.wearewarp.com";
/** Build the public tracking URL for a shipment from its order number (P-…). */
export declare function trackingUrl(orderNumber: string | undefined | null): string;
export interface ShipmentParty {
    name: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    contact_name: string;
    contact_phone: string;
    contact_email: string;
    window_from: string;
    window_to: string;
    tz: string;
}
export interface FreightItem {
    name: string;
    qty: number;
    qty_unit: string;
    weight_per_unit: number;
    weight_unit: string;
    length: number;
    width: number;
    height: number;
    size_unit: string;
    hazardous: boolean;
    stackable: boolean;
}
export interface ShipmentRow {
    shipment_number: string;
    order_number: string;
    tracking_number: string;
    tracking_url: string;
    mode: string;
    status: string;
    created: string;
    origin_city: string;
    origin_state: string;
    origin_zip: string;
    dest_city: string;
    dest_state: string;
    dest_zip: string;
    pickup: ShipmentParty;
    delivery: ShipmentParty;
    freight: FreightItem[];
}
export interface BookingsWidgetData {
    type: "bookings";
    total: number;
    shown: number;
    shipments: ShipmentRow[];
}
/**
 * Map the gw /freights/shipments response (or a single tracking record) into the
 * widget shape. Accepts either { data: [...] } (list) or a bare array.
 */
export declare function toBookingsWidgetData(response: unknown): BookingsWidgetData | null;
export declare function renderBookingsCard(data: BookingsWidgetData): string;
export declare function bookingsCardTemplate(): string;
export declare function bookingsCardMcpTemplate(): string;
export { MCP_APP_MIME_TYPE };
