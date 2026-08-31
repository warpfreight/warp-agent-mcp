#!/usr/bin/env node
/**
 * Prepublish guard against tool-count drift in package.json "description".
 *
 * The description prose has shipped a wrong "N tools" count more than once.
 * This guard extracts any "<N> tools" claim from the description and, if present,
 * verifies N equals the REAL registered tool count — obtained by speaking MCP
 * stdio to the built server (dist/index.js) and counting tools/list. A dist grep
 * can lie (registered ids differ from the public roster); the live tools/list can't.
 *
 * Rules:
 *   - Description states no "N tools" number  -> PASS (counts in prose rot; prefer none).
 *   - Description states "N tools" and N === roster -> PASS.
 *   - Description states "N tools" and N !== roster -> FAIL (blocks publish).
 *   - Set REQUIRE_TOOL_COUNT=1 to also FAIL when the description states no count at all
 *     (use only if you deliberately want the number asserted, not merely non-contradicted).
 *
 * Exit non-zero on any failure or if the roster can't be verified (fail-closed).
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

function fail(msg) {
  console.error(`\n[check-description] FAIL: ${msg}\n`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const desc = String(pkg.description ?? "");

// Match a tool-count claim like "31 tools" / "26  Tools". Not "30+ carriers", not "3+ stops".
const m = desc.match(/(\d+)\s+tools\b/i);
const stated = m ? Number(m[1]) : null;

if (stated === null && !process.env.REQUIRE_TOOL_COUNT) {
  console.log("[check-description] OK: description states no tool count (nothing to drift).");
  process.exit(0);
}

// Get the true roster count from the built server over MCP stdio.
const entry = join(root, "dist", "index.js");
let entryOk = true;
try { readFileSync(entry); } catch { entryOk = false; }
if (!entryOk) fail(`built server not found at dist/index.js — run "npm run build" before publishing.`);

function probeToolCount() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env, WARP_API_KEY: "" },
    });
    let buf = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error("timed out waiting for tools/list"));
    }, 15000);

    child.on("error", (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2 && msg.result && Array.isArray(msg.result.tools)) {
          done = true;
          clearTimeout(timer);
          try { child.kill("SIGKILL"); } catch {}
          resolve(msg.result.tools.length);
        }
      }
    });

    const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "check-description", version: "1" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  });
}

let roster;
try {
  roster = await probeToolCount();
} catch (e) {
  fail(`could not verify the tool roster from dist/index.js (${e.message}). Fail-closed.`);
}

if (!Number.isInteger(roster) || roster < 1) fail(`roster probe returned a bogus count (${roster}).`);

if (stated === null) {
  // REQUIRE_TOOL_COUNT was set but the description states no number.
  fail(`REQUIRE_TOOL_COUNT is set but the description states no "N tools" count. Roster is ${roster}.`);
}

if (stated !== roster) {
  fail(`description says "${stated} tools" but the server registers ${roster}. Fix the description (or drop the number).`);
}

console.log(`[check-description] OK: description "${stated} tools" matches the ${roster}-tool roster.`);
process.exit(0);
