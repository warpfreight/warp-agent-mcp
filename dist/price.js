/**
 * price_check: is a price good FOR THIS ACCOUNT, judged only by what the
 * account itself paid on the same lane and mode. No market data, no guesses:
 * every number in the answer comes from the account's own bookings, and the
 * answer says how many bookings it rests on. Too few comparables = "no basis",
 * never a verdict.
 */
const MODE_ALIASES = {
    ltl: "ltl", ftl: "ftl", truckload: "ftl", "full truckload": "ftl", "53ft": "ftl",
    van: "van", cargo_van: "van", "cargo van": "van", box_truck: "box_truck", "box truck": "box_truck", boxtruck: "box_truck",
};
export function normMode(m) {
    const s = String(m ?? "").trim().toLowerCase().replace(/-/g, "_");
    return MODE_ALIASES[s] ?? MODE_ALIASES[s.replace(/_/g, " ")] ?? s;
}
const zip5 = (z) => String(z ?? "").replace(/\D/g, "").slice(0, 5);
const num = (v) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;
function median(xs) {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export const MIN_COMPARABLES = 2;
// Inside this band the price is "in line"; outside it is above/below.
export const IN_LINE_PCT = 5;
export function priceContext(rows, q) {
    const now = q.now ?? Date.now();
    const windowDays = q.window_days ?? 180;
    const since = now - windowDays * 86400000;
    const mode = normMode(q.mode);
    const o = zip5(q.origin_zip), d = zip5(q.destination_zip);
    const usable = rows.filter((r) => {
        if (r.cancelled_at || String(r.status ?? "").toLowerCase() === "cancelled")
            return false;
        const price = num(r.price_usd);
        if (price === null || price <= 0)
            return false;
        const t = Date.parse(String(r.booked_at ?? ""));
        if (!Number.isFinite(t) || t < since)
            return false;
        return normMode(r.mode) === mode;
    });
    // Same exact ZIPs first; fall back to the same 3-digit ZIP areas.
    let basis = "exact_zip";
    let comps = usable.filter((r) => zip5(r.origin_zip) === o && zip5(r.destination_zip) === d);
    if (comps.length < MIN_COMPARABLES) {
        basis = "zip3_area";
        comps = usable.filter((r) => zip5(r.origin_zip).slice(0, 3) === o.slice(0, 3) && zip5(r.destination_zip).slice(0, 3) === d.slice(0, 3));
    }
    const lane = `${o} to ${d}`;
    if (comps.length < MIN_COMPARABLES) {
        return {
            verdict: "no_basis",
            comparable_bookings: comps.length,
            lane, mode, window_days: windowDays,
            note: `Fewer than ${MIN_COMPARABLES} of this account's own ${mode.toUpperCase()} bookings on this lane in the last ${windowDays} days, so there is nothing to compare against. Do not judge the price.`,
        };
    }
    // LTL scales with pallets, so compare per pallet when both sides have counts.
    const pallets = num(q.pallets);
    const perPallet = mode === "ltl" && pallets !== null && pallets > 0
        && comps.every((r) => (num(r.pallet_count) ?? 0) > 0);
    const values = comps.map((r) => perPallet ? num(r.price_usd) / num(r.pallet_count) : num(r.price_usd));
    const subject = perPallet ? q.price_usd / pallets : q.price_usd;
    const med = median(values);
    const deltaPct = round2(((subject - med) / med) * 100);
    const verdict = Math.abs(deltaPct) <= IN_LINE_PCT ? "in_line" : deltaPct < 0 ? "below_usual" : "above_usual";
    const unit = perPallet ? "per pallet" : "per shipment";
    const recent = [...comps]
        .sort((a, b) => Date.parse(String(b.booked_at)) - Date.parse(String(a.booked_at)))
        .slice(0, 3)
        .map((r) => ({
        booked_at: String(r.booked_at).slice(0, 10),
        price_usd: round2(num(r.price_usd)),
        pallets: num(r.pallet_count),
        shipment: r.shipment_number ?? null,
    }));
    return {
        verdict,
        delta_pct: deltaPct,
        unit,
        this_price: round2(subject),
        usual_median: round2(med),
        usual_low: round2(Math.min(...values)),
        usual_high: round2(Math.max(...values)),
        comparable_bookings: comps.length,
        basis,
        lane, mode, window_days: windowDays,
        recent,
        note: `Compared with ${comps.length} of this account's own ${mode.toUpperCase()} bookings ${basis === "exact_zip" ? "on these exact ZIPs" : "between these 3-digit ZIP areas"} in the last ${windowDays} days, ${unit}. Account history only, not market rates.`,
    };
}
//# sourceMappingURL=price.js.map