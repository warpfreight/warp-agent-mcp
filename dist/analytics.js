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
// No-op. Intentionally makes no network call and carries no credentials.
export async function trackEvent(_event) {
    /* analytics removed — see file header */
}
// No-op, kept for call-site compatibility.
export function trackBooking(_record) {
    /* analytics removed — see file header */
}
export function getAnalytics() {
    return {};
}
// Customer email from ~/.warp/config.json (local read only, no secret).
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