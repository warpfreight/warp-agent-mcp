#!/usr/bin/env node
/**
 * Hermetic regression guard for warp_book's auto-refund-on-failure path.
 *
 * No network, no API key, no real money: drives the REAL warp_book handler
 * from dist/tools.js with a stub client whose book() throws and a stub
 * global.fetch that answers /agents/charge-me (returns a PaymentIntent) and
 * /agents/refund-me. Asserts that a book failure after a successful charge:
 *   1. captures the charge's payment_intent_id, and
 *   2. POSTs it to /agents/refund-me, and
 *   3. tells the user the charge was refunded.
 *
 * If someone later drops the PI capture or the refund call, this fails.
 */
import { registerTools } from "../dist/tools.js";
import { WarpApiError } from "../dist/client.js";

let failures = 0;
const expect = (label, cond) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) failures += 1; };

const calls = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const body = opts?.body ? JSON.parse(opts.body) : {};
  calls.push({ url: u, body });
  if (u.includes("/agents/charge-me"))
    return new Response(JSON.stringify({ payment_intent_id: "pi_live_FAKE123", status: "succeeded" }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.includes("/agents/refund-me"))
    return new Response(JSON.stringify({ refund_id: "re_FAKE456", status: "succeeded", amount_refunded_cents: 12345 }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
};

const handlers = {};
const fakeServer = { tool: (name, _desc, _schema, handler) => { handlers[name] = handler; } };
const clientStub = {
  ltlQuote: async () => ({ warp_quote_id: "PRICING_STALE", warp_price: 123.45, options: [] }),
  book: async () => { throw new WarpApiError(400, { message: "quoteId is not valid" }); },
};
registerTools(fakeServer, clientStub, () => "wak_live_FAKEKEY1234567890");

console.log("== warp_book auto-refund on booking failure ==");
// Seed the session amount-cache the way a real quote would.
await handlers["warp_ltl_quote"]({ origin_zip: "90007", destination_zip: "90038", pickup_date: "2099-01-01", pallets: 1, weight_lbs_per_pallet: 500 });
const b = await handlers["warp_book"]({
  quote_id: "PRICING_STALE",
  pickup:   { zipCode: "90007", city: "LA", state: "CA", street: "1 A St", contactName: "T", phone: "3105551234", email: "x@y.com" },
  delivery: { zipCode: "90038", city: "LA", state: "CA", street: "2 B St", contactName: "R", phone: "3105551234" },
});
const text = b.content?.[0]?.text ?? "";
const refund = calls.find((c) => c.url.includes("/agents/refund-me"));

expect("book returns isError", b.isError === true);
expect("charge-me was called", calls.some((c) => c.url.includes("/agents/charge-me")));
expect("refund-me was called", !!refund);
expect("refund-me got the charge's payment_intent_id", refund?.body?.payment_intent_id === "pi_live_FAKE123");
expect("user is told the charge was refunded", /automatically refunded/i.test(text));
expect("charge → refund ordering", (() => {
  const ci = calls.findIndex((c) => c.url.includes("/agents/charge-me"));
  const ri = calls.findIndex((c) => c.url.includes("/agents/refund-me"));
  return ci >= 0 && ri > ci;
})());

console.log(failures === 0 ? "\n✅ refund guard passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
