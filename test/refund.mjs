#!/usr/bin/env node
/**
 * Hermetic regression guard for book's failure handling under the
 * server-side payment model (0.6.0+).
 *
 * No network, no API key, no real money: drives the REAL book handler
 * from dist/tools.js with a stub client whose book() throws, plus a stub
 * global.fetch that records any call to /agents/charge-me or /agents/refund-me.
 *
 * Booking is now atomic server-side: POST /api/v1/book charges the saved card,
 * books upstream, and refunds the charge itself if the booking fails. The MCP
 * must therefore NOT charge or refund client-side — doing so would double-charge.
 * So on a book failure this asserts that book:
 *   1. returns a clean isError result (not a crash),
 *   2. actually reached client.book() (got past the re-quote guard),
 *   3. surfaces an actionable message (here: stale quote → "expired"), and
 *   4. makes NO client-side /agents/charge-me or /agents/refund-me call.
 *
 * If someone reintroduces client-side charging/refunding, the tripwires fire.
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
  // Tripwires: a 0.6.0+ book must never hit these. If it does, the
  // assertions below catch it (the recorded call proves a client-side charge/refund).
  if (u.includes("/agents/charge-me"))
    return new Response(JSON.stringify({ payment_intent_id: "pi_live_FAKE123", status: "succeeded" }), { status: 200, headers: { "content-type": "application/json" } });
  if (u.includes("/agents/refund-me"))
    return new Response(JSON.stringify({ refund_id: "re_FAKE456", status: "succeeded" }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
};

const handlers = {};
// McpServer.tool() has 3/4/5-arg overloads; the handler is always the LAST arg
// (a 5th annotations object — { title, readOnlyHint } — sits before it on quote tools).
// tools.ts wraps registration in a local tool() helper that calls
// server.registerTool(name, config, handler) so each tool gets a display title.
// The stub must implement BOTH shapes or registerTools() throws on import.
const fakeServer = {
  tool: (name, ...rest) => { handlers[name] = rest[rest.length - 1]; },
  registerTool: (name, _config, handler) => { handlers[name] = handler; },
};
const clientStub = {
  ltlQuote: async () => ({ warp_quote_id: "PRICING_STALE", warp_price: 123.45, options: [] }),
  book: async () => { throw new WarpApiError(400, { message: "quoteId is not valid" }); },
};
registerTools(fakeServer, clientStub, () => "wak_live_FAKEKEY1234567890");

console.log("== book failure handling (server-side payment model) ==");
// Deliberately do NOT quote first. This is the regression guard for the
// serverless cache-miss bug: `book` used to refuse any quote_id that wasn't in
// THIS process's memory, which on the hosted remote meant a caller who had just
// quoted (on another instance) was told to re-quote. /api/v1/book resolves and
// expiry-checks the quote server-side, so a cache miss must reach client.book()
// and let the server decide. If someone reinstates a local session guard, the
// "reached client.book()" assertion below fails.
const b = await handlers["book"]({
  quote_id: "PRICING_STALE",
  pickup:   { zipCode: "90007", city: "LA", state: "CA", street: "1 A St", contactName: "T", phone: "3105551234", email: "x@y.com" },
  delivery: { zipCode: "90038", city: "LA", state: "CA", street: "2 B St", contactName: "R", phone: "3105551234" },
});
const text = b.content?.[0]?.text ?? "";

expect("book returns isError", b.isError === true);
expect("reached client.book() (past the re-quote guard)", !/no quote found/i.test(text));
expect("surfaces an actionable stale-quote message", /expired/i.test(text));
expect("NO client-side /agents/charge-me call (charge is server-side)", !calls.some((c) => c.url.includes("/agents/charge-me")));
expect("NO client-side /agents/refund-me call (refund is server-side)", !calls.some((c) => c.url.includes("/agents/refund-me")));

console.log(failures === 0 ? "\n✅ refund guard passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
