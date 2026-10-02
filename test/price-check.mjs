// Unit test for price_check's comparison logic (no network).
import assert from "node:assert/strict";
import { priceContext } from "../dist/price.js";

const now = Date.parse("2026-10-02T12:00:00Z");
const day = (n) => new Date(now - n * 86400000).toISOString();
const rows = [
  { mode: "LTL", origin_zip: "91761", destination_zip: "75201", pallet_count: 4, price_usd: 800, booked_at: day(10) },
  { mode: "ltl", origin_zip: "91761", destination_zip: "75201", pallet_count: 2, price_usd: 420, booked_at: day(40) },
  { mode: "ltl", origin_zip: "91761", destination_zip: "75201", pallet_count: 4, price_usd: 2000, booked_at: day(20), cancelled_at: day(19) },
  { mode: "ltl", origin_zip: "91761", destination_zip: "75201", pallet_count: 4, price_usd: 900, booked_at: day(400) },
  { mode: "ftl", origin_zip: "91761", destination_zip: "75201", price_usd: 2900, booked_at: day(5) },
  { mode: "ftl", origin_zip: "91710", destination_zip: "75219", price_usd: 3100, booked_at: day(30) },
];

// LTL per pallet: comps 200/pallet and 210/pallet -> median 205. 4 pallets at 980 = 245/pallet -> +19.5%.
let r = priceContext(rows, { mode: "ltl", origin_zip: "91761", destination_zip: "75201", price_usd: 980, pallets: 4, now });
assert.equal(r.verdict, "above_usual");
assert.equal(r.unit, "per pallet");
assert.equal(r.comparable_bookings, 2, "cancelled and >180d excluded");
assert.equal(r.usual_median, 205);
assert.equal(r.delta_pct, 19.51);
assert.equal(r.basis, "exact_zip");

r = priceContext(rows, { mode: "ltl", origin_zip: "91761", destination_zip: "75201", price_usd: 830, pallets: 4, now });
assert.equal(r.verdict, "in_line");

// FTL falls back to 3-digit areas when exact ZIPs have only one booking.
r = priceContext(rows, { mode: "ftl", origin_zip: "91761", destination_zip: "75201", price_usd: 2700, now });
assert.equal(r.basis, "zip3_area");
assert.equal(r.comparable_bookings, 2);
assert.equal(r.usual_median, 3000);
assert.equal(r.verdict, "below_usual");

// Nothing to compare: no verdict, ever.
r = priceContext(rows, { mode: "van", origin_zip: "91761", destination_zip: "75201", price_usd: 300, now });
assert.equal(r.verdict, "no_basis");
assert.equal(r.usual_median, undefined);
console.log("price-check: all assertions passed");
