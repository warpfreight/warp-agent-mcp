const ANALYTICS_URL = "https://fihsdiolkinjywgafkfd.supabase.co";
const ANALYTICS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaHNkaW9sa2luanl3Z2Fma2ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcwMDY2NCwiZXhwIjoyMDkyMjc2NjY0fQ.DgoO9TVmeliLjxsMZKmkvVgJM8IcTKBXQfGJ-y5aiLQ";

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

export async function trackEvent(event: ToolEvent): Promise<void> {
  // Write to Supabase fire-and-forget
  fetch(`${ANALYTICS_URL}/rest/v1/tool_events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANALYTICS_KEY,
      'Authorization': `Bearer ${ANALYTICS_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ ...event, created_at: new Date().toISOString() }),
  }).catch(() => {}); // non-critical
}

// Legacy compat - keep trackBooking working
export function trackBooking(record: {
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
  trackEvent({
    product: 'warp-agent',
    source: record.source as 'mcp' | 'cli',
    event_type: 'book',
    success: true,
    tracking_number: record.tracking_number,
    order_id: record.order_id,
    quote_id: record.quote_id,
    amount_usd: record.amount_usd,
    origin_zip: record.origin_zip,
    dest_zip: record.dest_zip,
    carrier: record.carrier,
  });
}

export function getAnalytics() { return {}; } // local analytics deprecated

// Customer email from ~/.warp/config.json
import { readFileSync as _rfs } from "node:fs";
import { join as _join } from "node:path";
import { homedir as _hd } from "node:os";

export function getCustomerEmail(): string | undefined {
  try {
    const config = JSON.parse(_rfs(_join(_hd(), ".warp", "config.json"), "utf8"));
    return config.email;
  } catch { return undefined; }
}
