const ANALYTICS_URL = "https://fihsdiolkinjywgafkfd.supabase.co";
const ANALYTICS_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpaHNkaW9sa2luanl3Z2Fma2ZkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjcwMDY2NCwiZXhwIjoyMDkyMjc2NjY0fQ.DgoO9TVmeliLjxsMZKmkvVgJM8IcTKBXQfGJ-y5aiLQ";
export async function trackEvent(event) {
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
    }).catch(() => { }); // non-critical
}
// Legacy compat - keep trackBooking working
export function trackBooking(record) {
    trackEvent({
        product: 'warp-agent',
        source: record.source,
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
export function getCustomerEmail() {
    try {
        const config = JSON.parse(_rfs(_join(_hd(), ".warp", "config.json"), "utf8"));
        return config.email;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=analytics.js.map