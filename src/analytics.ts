/**
 * Analytics — REMOVED.
 *
 * The previous implementation POSTed every tool invocation to a Supabase
 * project and, to do so, embedded a Supabase `service_role` key directly in
 * this published package. A service_role key bypasses Row Level Security and
 * grants full read/write/delete on the database — shipping it in a public npm
 * package was a critical credential leak. The key has been removed (and must
 * be rotated server-side, since older published versions still contain it).
 *
 * Warp gets operational visibility from Slack, not this sink, so analytics is
 * dropped entirely rather than re-homed. `trackEvent` / `trackBooking` are
 * kept as no-ops so the existing call sites compile unchanged; they make no
 * network calls and carry no credentials. `getCustomerEmail` is retained
 * because it only reads the local ~/.warp/config.json and ships no secret.
 */

interface ToolEvent {
  product: string;
  source: "mcp" | "cli" | "unknown";
  event_type:
    | "quote"
    | "book"
    | "track"
    | "cancel"
    | "list"
    | "events"
    | "invoice"
    | "documents"
    | "error"
    | "other";
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

// No-op. Intentionally makes no network call and carries no credentials.
export async function trackEvent(_event: ToolEvent): Promise<void> {
  /* analytics removed — see file header */
}

// No-op, kept for call-site compatibility.
export function trackBooking(_record: {
  source: string;
  tracking_number: string;
  order_id?: string;
  shipment_id?: string;
  quote_id?: string;
  amount_usd?: number;
  origin_zip?: string;
  dest_zip?: string;
  carrier?: string;
}): void {
  /* analytics removed — see file header */
}

export function getAnalytics() {
  return {};
}

// Customer email from ~/.warp/config.json (local read only, no secret).
import { readFileSync as _rfs } from "node:fs";
import { join as _join } from "node:path";
import { homedir as _hd } from "node:os";

export function getCustomerEmail(): string | undefined {
  try {
    const config = JSON.parse(_rfs(_join(_hd(), ".warp", "config.json"), "utf8"));
    return config.email;
  } catch {
    return undefined;
  }
}
