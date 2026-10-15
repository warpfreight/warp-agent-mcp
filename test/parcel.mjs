// parcel_quote / parcel_book: request shapes sent to warp-site, the keyless
// refusal, and the same "pending is not failed" rule book() follows. No
// network: fetch is stubbed and the tools run against a stub client.
import assert from "node:assert/strict";
process.env.WARP_BOOK_TIMEOUT_MS = "200";
const { WarpClient, WarpApiError, BookingPendingError } = await import("../dist/client.js");
const { registerTools } = await import("../dist/tools.js");

const realFetch = globalThis.fetch;
const origErr = console.error;
const logs = [];
console.error = (l) => logs.push(String(l));

// ── client: endpoints and bodies ──────────────────────────────
const client = new WarpClient("https://www.wearewarp.com/api/v1/warp", () => "wak_test_x");
let seen;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization };
  return new Response(JSON.stringify({ options: [] }), { status: 200 });
};
await client.parcelOptions({ origin_zip: "90058", destination_zip: "10001", pickup_date: "2026-10-20", packages: [{ quantity: 2, length_in: 12, width_in: 10, height_in: 8, weight_lbs: 15 }] });
assert.equal(seen.url, "https://www.wearewarp.com/api/v1/parcel/options");
assert.equal(seen.auth, "Bearer wak_test_x");
assert.equal(seen.body.packages[0].weight_lbs, 15);

// parcelBook: timeout and 409 are pending, a 400 is a rejection, 200 returns the body
const keepAlive = setTimeout(() => {}, 5000);
globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
await assert.rejects(client.parcelBook({ quote_id: "01P" }), (e) => e instanceof BookingPendingError && e.reason === "timeout");
clearTimeout(keepAlive);
globalThis.fetch = async () => new Response(JSON.stringify({ code: "BOOKING_IN_PROGRESS" }), { status: 409 });
await assert.rejects(client.parcelBook({ quote_id: "01P" }), (e) => e instanceof BookingPendingError && e.reason === "in_progress");
globalThis.fetch = async () => new Response(JSON.stringify({ code: "ZIP_MISMATCH" }), { status: 400 });
await assert.rejects(client.parcelBook({ quote_id: "01P" }), (e) => e instanceof WarpApiError && e.status === 400);
globalThis.fetch = async (url) => { seen = { url: String(url) }; return new Response(JSON.stringify({ booked: true, booking_id: "S-1" }), { status: 200 }); };
assert.equal((await client.parcelBook({ quote_id: "01P" })).booking_id, "S-1");
assert.equal(seen.url, "https://www.wearewarp.com/api/v1/parcel/book");
globalThis.fetch = realFetch;

// ── tools ─────────────────────────────────────────────────────
const handlers = new Map();
const server = { registerTool(name, _config, handler) { handlers.set(name, handler); return { update() {} }; } };
const calls = [];
const stubClient = {
  parcelOptions: async (b) => { calls.push(["options", b]); return { options: [{ quote_id: "01P", price_usd: 41.87, pickup_type: "fedex_pickup" }] }; },
  parcelBook: async (b) => { calls.push(["book", b]); return { booked: true, booking_id: "S-1", price_usd: 41.87 }; },
};
const delivery = { zipCode: "10001", city: "New York", state: "NY", street: "350 5th Ave", contactName: "John", phone: "2125550199" };

// keyless: refused before any call
registerTools(server, stubClient, () => undefined);
const anon = await handlers.get("parcel_quote")({ origin_zip: "90058", destination_zip: "10001", pickup_date: "2026-10-20", packages: [{ quantity: 1, length_in: 6, width_in: 6, height_in: 6, weight_lbs: 2 }] });
assert.equal(anon.isError, true);
assert.equal((await handlers.get("parcel_book")({ quote_id: "01P", delivery })).isError, true);
assert.equal(calls.length, 0, "keyless parcel calls must not reach warp-site");

registerTools(server, stubClient, () => "wak_live_x");
const q = await handlers.get("parcel_quote")({ origin_zip: "90058", destination_zip: "10001", pickup_date: "2026-10-20", packages: [{ quantity: 2, length_in: 12, width_in: 10, height_in: 8, weight_lbs: 15 }] });
assert.notEqual(q.isError, true);
assert.match(q.content[0].text, /parcel_book/);
const b = await handlers.get("parcel_book")({ quote_id: "01P", delivery, reference: "PO-9" });
assert.notEqual(b.isError, true);
const [, bookBody] = calls.find(([k]) => k === "book");
assert.deepEqual(bookBody, { quote_id: "01P", patch: { delivery }, reference: "PO-9" });

console.error = origErr;
for (const l of logs) assert.doesNotMatch(l, /wak_test_x|wak_live_x|350 5th/, "log lines must not carry keys or addresses");
console.log("parcel: ok");
