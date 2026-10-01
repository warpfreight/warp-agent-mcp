// report_issue: the tool sends exactly what warp-site's POST /api/mcp/feedback
// accepts, and maps each documented response to a plain next step.
//
// test/fixtures/mcp-feedback-schema.ts is a verbatim copy of warp-site
// src/lib/mcp-feedback-schema.ts (the endpoint's validator). Every body the tool
// sends is run through that real validator, so a drift between the two shows up
// here instead of as rejected reports in production. Refresh the copy if the
// endpoint's schema changes. No network calls: fetch is stubbed throughout.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerTools } from "../dist/tools.js";
import { WarpClient } from "../dist/client.js";

const src = readFileSync(new URL("./fixtures/mcp-feedback-schema.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dir = mkdtempSync(join(tmpdir(), "fb-schema-"));
writeFileSync(join(dir, "schema.mjs"), js);
const { validateFeedback, validateIdempotencyKey } = await import(join(dir, "schema.mjs"));

let key = "wak_live_testkey_0000000000";
const warp = new WarpClient("https://www.wearewarp.com/api/v1/warp/", () => key);
const server = new McpServer({ name: "t", version: "1" });
registerTools(server, warp, () => key);
const mcp = new Client({ name: "t", version: "1" });
const [a, b] = InMemoryTransport.createLinkedPair();
await server.connect(a); await mcp.connect(b);

const realFetch = globalThis.fetch;
let calls = [];
const respond = (status, body) => { globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }); }; };
const call = async (args) => { const r = await mcp.callTool({ name: "report_issue", arguments: args }); return { isError: !!r.isError, out: JSON.parse(r.content[0].text.startsWith("{") ? r.content[0].text : JSON.stringify({ text: r.content[0].text })) }; };
const base = { category: "unexpected_result", tool_name: "ltl_quote", summary: "Quote total ignores the liftgate fee", expected_behavior: "Total includes the liftgate accessorial", observed_behavior: "Total equals linehaul only; accessorial listed but not added", customer_blocked: false, quote_id: "PRICING_d9b146a0" };
let n = 0; const ok = (m) => console.log(`  ok ${++n} ${m}`);

// 1. Listed with the right shape
const { tools } = await mcp.listTools();
const t = tools.find((x) => x.name === "report_issue");
assert.ok(t, "report_issue registered");
assert.deepEqual([...t.inputSchema.required].sort(), ["category", "customer_blocked", "expected_behavior", "observed_behavior", "summary", "tool_name"]);
ok("registered; required fields match the endpoint's REQUIRED list");

// 2. Success: endpoint, auth, idempotency, and a body the real validator accepts
calls = []; respond(201, { feedback_id: "fb_1", status: "open", duplicate: false, message: "Warp received this report. Reporting does not retry, rebook or cancel your shipment." });
let r = await call(base);
assert.equal(r.isError, false); assert.equal(r.out.received, true); assert.equal(r.out.feedback_id, "fb_1");
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://www.wearewarp.com/api/mcp/feedback");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers["Authorization"], `Bearer ${key}`);
const sent = JSON.parse(calls[0].init.body);
const v = validateFeedback(sent);
assert.ok(v.ok, "server validator accepts the body: " + (v.error ?? ""));
assert.equal(sent.client, "warp-agent-mcp"); assert.match(sent.mcp_version, /^\d+\.\d+\.\d+/);
const idem = calls[0].init.headers["Idempotency-Key"];
assert.equal(typeof validateIdempotencyKey(idem), "string", "server accepts the Idempotency-Key");
ok("201: posts to /api/mcp/feedback with Bearer key; body and Idempotency-Key pass warp-site's own validator");

// 3. Same report twice -> same Idempotency-Key (no IDEMPOTENCY_CONFLICT); different report -> different key
calls = []; respond(200, { feedback_id: "fb_1", status: "open", duplicate: true });
r = await call(base);
assert.equal(calls[0].init.headers["Idempotency-Key"], idem); assert.equal(r.out.duplicate, true); assert.equal(r.isError, false);
calls = []; respond(201, { feedback_id: "fb_2", status: "open", duplicate: false });
await call({ ...base, summary: "A different problem" });
assert.notEqual(calls[0].init.headers["Idempotency-Key"], idem);
ok("retry reuses the key and reports duplicate; a different report gets a new key");

// 4. Minimal report (no optional ids) also validates; optional fields are omitted, not sent empty
calls = []; respond(201, { feedback_id: "fb_3", status: "open", duplicate: false });
await call({ category: "missing_capability", tool_name: "book", summary: "Cannot book a flatbed", expected_behavior: "Book a flatbed load", observed_behavior: "No flatbed mode exists", customer_blocked: true });
const minimal = JSON.parse(calls[0].init.body);
assert.ok(validateFeedback(minimal).ok); assert.ok(!("quote_id" in minimal) && !("shipment_id" in minimal));
ok("minimal report validates; unset optional fields are not sent");

// 5. Each documented failure maps to a next step and received:false
const cases = [
  [400, { error: "Report text contains a Warp API key. Remove it and resubmit.", code: "VALIDATION" }, /rejected: Report text contains a Warp API key/],
  [401, { error: "Invalid or missing API key.", code: "AUTH_INVALID" }, /Reconnect your Warp account/],
  [429, { error: "Too many", code: "RATE_LIMITED" }, /too many reports/],
  [503, { error: "Feedback reporting is not enabled.", code: "FEEDBACK_DISABLED" }, /not accepting reports/],
  [503, { error: "Could not store", code: "FEEDBACK_UNAVAILABLE" }, /could not store the report/],
  [413, { error: "too large", code: "PAYLOAD_TOO_LARGE" }, /too long/],
];
for (const [status, body, re] of cases) {
  respond(status, body); r = await call(base);
  assert.equal(r.isError, true); assert.equal(r.out.received, false); assert.match(r.out.message, re);
}
globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
r = await call(base); assert.equal(r.out.code, "FEEDBACK_UNREACHABLE"); assert.equal(r.out.received, false);
ok("400/401/413/429/503 and network failure all return received:false with a next step");

// 6. No account connected -> no network call
key = undefined; calls = []; respond(201, {});
r = await call(base);
assert.equal(r.isError, true); assert.equal(calls.length, 0); assert.match(r.out.text, /connected Warp account/);
ok("without a connected account it refuses locally and calls nothing");

// 7. The tool's own schema rejects bad input before any call
key = "wak_live_testkey_0000000000"; calls = []; respond(201, {});
r = await mcp.callTool({ name: "report_issue", arguments: { ...base, category: "praise" } });
assert.equal(r.isError, true); assert.equal(calls.length, 0);
ok("invalid category is rejected by the tool schema without calling Warp");

globalThis.fetch = realFetch;
await mcp.close();
console.log(`report-issue: ${n}/${n} ok`);
