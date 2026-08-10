#!/usr/bin/env node
/**
 * End-to-end smoke test for warp-agent-mcp.
 *
 * What it does:
 *   1. Spawns the MCP via stdio (same path Claude Desktop / Cursor / Claude Code use)
 *   2. Sends `initialize` + `notifications/initialized`
 *   3. Calls `tools/list` and asserts every expected tool name is registered
 *   4. Calls a representative set of tools and asserts the response shape
 *   5. Exits 0 on success, 1 on any failure
 *
 * What it does NOT do:
 *   - Book any freight (would charge real money). Booking is exercised against
 *     the book schema validator only.
 *
 * Required env:
 *   WARP_API_KEY  — a wak_test_* sandbox key. Live keys also work but the
 *                   booking-charge protections require the test path.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_MJS = join(__dirname, "..", "scripts", "run.mjs");

// Tools the MCP MUST expose. Tests fail if any are missing or extra.
// Reduced from 20 → 16 in 0.5.68 — removed warp_cancel (Warp blocks self-cancel),
// warp_rate_card (account-state, AuthorizationRequired for fresh accounts),
// multistop_quote + multistop_book (sparse backend lane coverage).
// Multistop re-added in 0.14.0 against the canonical /api/v1/multistop/*
// endpoints (coverage still route-dependent, surfaced as a clean message).
const EXPECTED_TOOLS = [
  "analytics",
  "batch_book",
  "batch_quote",
  "book",
  "box_truck_quote",
  "delete_load_template",
  "events",
  "ftl_quote",
  "get_documents",
  "get_invoice",
  "lane_history",
  "list_bookings",
  "load_templates",
  "locations",
  "login",
  "ltl_market_options",
  "ltl_quote",
  "compare_modes",
  "multistop_book",
  "multistop_quote",
  "payment_status",
  "automate_lane",
  "manage_automation",
  "automation_receipts",
  "quote_history",
  "save_load_template",
  "status",
  "track",
  "van_quote",
];

function resolveKey() {
  if (process.env.WARP_API_KEY) return process.env.WARP_API_KEY;
  try {
    const cfg = JSON.parse(
      readFileSync(join(homedir(), ".warp", "config.json"), "utf8"),
    );
    return cfg.sandbox_api_key ?? cfg.api_key;
  } catch {
    return undefined;
  }
}

let failures = 0;
function expect(label, cond, detail) {
  const sym = cond ? "✓" : "✗";
  console.log(`  ${sym} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures += 1;
}

async function main() {
  const key = resolveKey();
  if (!key) {
    console.error("Missing WARP_API_KEY (or ~/.warp/config.json). Skipping e2e.");
    process.exit(0); // soft-skip in CI envs without a key
  }

  const proc = spawn(process.execPath, [RUN_MJS], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, WARP_API_KEY: key },
  });

  let buf = "";
  const waits = new Map();
  proc.stdout.on("data", (c) => {
    buf += c.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line);
        if (m.id != null && waits.has(m.id)) {
          waits.get(m.id)(m);
          waits.delete(m.id);
        }
      } catch {
        /* tolerate non-JSON stderr-on-stdout */
      }
    }
  });

  const stderr = [];
  proc.stderr.on("data", (c) => stderr.push(c.toString()));

  let id = 0;
  const call = (method, params) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      waits.set(myId, resolve);
      const t = setTimeout(() => {
        waits.delete(myId);
        reject(new Error(`Timeout: ${method} #${myId}`));
      }, 45000);
      waits.set(myId, (m) => {
        clearTimeout(t);
        resolve(m);
      });
      proc.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n",
      );
    });
  const notify = (method, params) =>
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
    );

  // ── Boot ────────────────────────────────────────────────────────
  console.log("== Boot ==");
  const init = await call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "e2e-smoke", version: "1" },
  });
  expect("initialize responds", init.result?.serverInfo?.name === "warp-agent-mcp");
  notify("notifications/initialized", {});

  await new Promise((r) => setTimeout(r, 200));
  expect(
    "API key loaded message in stderr",
    stderr.join("").includes("[warp-mcp] API key loaded"),
  );

  // ── tools/list ──────────────────────────────────────────────────
  console.log("\n== tools/list ==");
  const list = await call("tools/list", {});
  const names = (list.result?.tools ?? []).map((t) => t.name).sort();
  expect(`tools count is ${EXPECTED_TOOLS.length}`, names.length === EXPECTED_TOOLS.length, `got ${names.length}`);
  for (const t of EXPECTED_TOOLS) {
    expect(`registered: ${t}`, names.includes(t));
  }
  // Catch surprise additions
  for (const n of names) {
    if (!EXPECTED_TOOLS.includes(n)) {
      expect(`unexpected tool: ${n}`, false, "update EXPECTED_TOOLS if intentional");
    }
  }

  // ── Regression: book pickup + delivery must advertise as full
  //    object schemas, never a $ref or untyped node. A shared Zod instance
  //    used to emit delivery as "$ref: #/properties/pickup", which MCP
  //    clients serialized as a string → "Expected object, received string"
  //    and bookings on new lanes were impossible. (Reported 2029-05.)
  console.log("\n== book delivery schema (regression guard) ==");
  const bookTool = (list.result?.tools ?? []).find((t) => t.name === "book");
  const props = bookTool?.inputSchema?.properties ?? {};
  expect("pickup advertised as type:object", props.pickup?.type === "object");
  expect("delivery advertised as type:object", props.delivery?.type === "object");
  expect("delivery has a properties block", !!props.delivery?.properties);
  expect(
    "delivery requires the core address fields (not email)",
    Array.isArray(props.delivery?.required) &&
      ["zipCode", "city", "state", "street", "contactName", "phone"].every((f) =>
        props.delivery.required.includes(f),
      ) &&
      !props.delivery.required.includes("email"),
  );
  expect(
    "book inputSchema contains no $ref (clients can't dereference)",
    !JSON.stringify(bookTool?.inputSchema ?? {}).includes("$ref"),
  );

  // ── status ─────────────────────────────────────────────────
  console.log("\n== status ==");
  const status = await call("tools/call", { name: "status", arguments: {} });
  const statusBody = JSON.parse(status.result?.content?.[0]?.text ?? "{}");
  expect("status returns api version", statusBody.api === "v1");
  expect("status returns commit", typeof statusBody.commit === "string");

  // ── payment_status ────────────────────────────────────────
  console.log("\n== payment_status ==");
  const pay = await call("tools/call", { name: "payment_status", arguments: {} });
  const payBody = JSON.parse(pay.result?.content?.[0]?.text ?? "{}");
  expect("payment_status returns has_card boolean", typeof payBody.has_card === "boolean");

  // ── ftl_quote ──────────────────────────────────────────────
  console.log("\n== ftl_quote (public endpoint, no auth needed) ==");
  const ftl = await call("tools/call", {
    name: "ftl_quote",
    arguments: { origin_zip: "90007", destination_zip: "90038", pickup_date: futureDate() },
  });
  const ftlBody = JSON.parse(ftl.result?.content?.[0]?.text ?? "{}");
  expect("ftl quote returns warp_quote_id", typeof ftlBody.warp_quote_id === "string");
  expect("ftl quote returns warp_price > 0", typeof ftlBody.warp_price === "number" && ftlBody.warp_price > 0);

  // ── ltl_quote ──────────────────────────────────────────────
  console.log("\n== ltl_quote ==");
  const ltl = await call("tools/call", {
    name: "ltl_quote",
    arguments: {
      origin_zip: "90007",
      destination_zip: "90038",
      pickup_date: futureDate(),
      pallets: 2,
      weight_lbs_per_pallet: 500,
      commodity: "general freight",
      length_in: 48,
      width_in: 40,
      height_in: 48,
      stackable: true,
    },
  });
  const ltlBody = JSON.parse(ltl.result?.content?.[0]?.text ?? "{}");
  expect("ltl quote returns warp_quote_id", typeof ltlBody.warp_quote_id === "string");

  // ── quote_history ─────────────────────────────────────────
  console.log("\n== quote_history ==");
  const history = await call("tools/call", { name: "quote_history", arguments: {} });
  const histBody = JSON.parse(history.result?.content?.[0]?.text ?? "[]");
  expect("quote_history returns array", Array.isArray(histBody));

  // ── book schema validation (no real book) ─────────────────
  console.log("\n== book input validation (no actual booking) ==");
  const badBook = await call("tools/call", {
    name: "book",
    arguments: { quote_id: "NOT_REAL_ID" }, // missing required pickup/delivery on lanes with no default
  });
  // Either it tells us to quote first, or fails validation cleanly. Both prove the tool is wired.
  expect(
    "book returns structured error/text (not crash)",
    typeof (badBook.result?.content?.[0]?.text) === "string",
  );

  // ── Done ───────────────────────────────────────────────────────
  console.log(failures === 0 ? "\n✅ all checks passed" : `\n❌ ${failures} check(s) failed`);
  proc.kill();
  process.exit(failures === 0 ? 0 : 1);
}

function futureDate() {
  const d = new Date(Date.now() + 7 * 86400000);
  return d.toISOString().slice(0, 10);
}

main().catch((err) => {
  console.error("Test harness crashed:", err);
  process.exit(2);
});
