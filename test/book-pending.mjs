// /api/v1/book outcomes the MCP must never report as "failed, nothing booked":
// a call that outlives the wait, and 409 BOOKING_IN_PROGRESS. Both are pending;
// a real rejection still surfaces as WarpApiError. No network: fetch is stubbed.
import assert from "node:assert/strict";
process.env.WARP_BOOK_TIMEOUT_MS = "200";
const { WarpClient, WarpApiError, BookingPendingError } = await import("../dist/client.js");
const { bookingPendingText } = await import("../dist/tools.js");

const client = new WarpClient("https://gw.example", "wak_test_x");
const logs = []; const origErr = console.error; console.error = (l) => logs.push(String(l));
const realFetch = globalThis.fetch;
const stub = (fn) => { globalThis.fetch = fn; };
const body = { quote_id: "wq_TEST123", delivery: { zipCode: "33312" } };

// 1. slower than the wait: pending, not an error the agent reads as failure
// AbortSignal.timeout() is unref'd; a real socket keeps the loop alive, so hold it here.
const keepAlive = setTimeout(() => {}, 5000);
stub((url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason))));
await assert.rejects(client.book(body), (e) => e instanceof BookingPendingError && e.reason === "timeout" && e.quoteId === "wq_TEST123");
clearTimeout(keepAlive);

// 2. 409 BOOKING_IN_PROGRESS: pending
stub(async () => new Response(JSON.stringify({ code: "BOOKING_IN_PROGRESS", error: "mid-booking" }), { status: 409 }));
await assert.rejects(client.book(body), (e) => e instanceof BookingPendingError && e.reason === "in_progress");

// 3. a real rejection is still a rejection, with the missing fields logged
stub(async () => new Response(JSON.stringify({ code: "INCOMPLETE_DELIVERY", missing_fields: ["phone", "email"] }), { status: 400 }));
await assert.rejects(client.book(body), (e) => e instanceof WarpApiError && e.status === 400);

// 4. success returns the body and logs a booked line
stub(async () => new Response(JSON.stringify({ shipment_number: "S-1-2639", idempotent_replay: true }), { status: 200 }));
const ok = await client.book(body);
assert.equal(ok.shipment_number, "S-1-2639");

globalThis.fetch = realFetch; console.error = origErr;
const parsed = logs.map((l) => JSON.parse(l)).filter((l) => l.evt === "warp_book");
assert.deepEqual(parsed.map((l) => l.outcome), ["pending", "pending", "rejected", "booked"]);
assert.deepEqual(parsed[2].missing_fields, ["phone", "email"]);
assert.equal(parsed[3].replay, true);
for (const l of logs) assert.doesNotMatch(l, /33312|wak_test_x/, "log line must not carry addresses or keys");

// 5. the pending text tells the agent to retry the same quote and not to re-quote
const t = bookingPendingText("wq_TEST123");
assert.match(t, /STILL PROCESSING \(not failed\)/);
assert.match(t, /Do NOT get a new quote/);
assert.match(t, /SAME quote_id \(wq_TEST123\)/);
console.log("book-pending: 5/5 ok");
