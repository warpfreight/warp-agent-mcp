#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RUN_MJS = join(__dirname, "..", "scripts", "run.mjs");
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);

let failures = 0;
const expect = (label, cond) => {
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
  if (!cond) failures += 1;
};

function run(args) {
  return spawnSync(process.execPath, [RUN_MJS, ...args], {
    encoding: "utf8",
    env: { ...process.env, WARP_API_KEY: "" },
  });
}

console.log("== warp-agent-mcp CLI metadata flags ==");

const help = run(["--help"]);
expect("--help exits 0", help.status === 0);
expect("--help prints usage", help.stdout.includes("Usage:"));
expect("--help avoids API-key diagnostics", !help.stderr.includes("NO API KEY"));

const shortHelp = run(["-h"]);
expect("-h exits 0", shortHelp.status === 0);
expect("-h prints usage", shortHelp.stdout.includes("Usage:"));

const version = run(["--version"]);
expect("--version exits 0", version.status === 0);
expect("--version prints package version", version.stdout.trim() === packageJson.version);
expect("--version avoids API-key diagnostics", !version.stderr.includes("NO API KEY"));

const shortVersion = run(["-v"]);
expect("-v exits 0", shortVersion.status === 0);
expect("-v prints package version", shortVersion.stdout.trim() === packageJson.version);

const unknown = run(["--definitely-not-a-real-flag"]);
expect("unknown flag exits non-zero", unknown.status === 1);
expect("unknown flag reports the flag", unknown.stderr.includes("--definitely-not-a-real-flag"));
expect("unknown flag avoids API-key diagnostics", !unknown.stderr.includes("NO API KEY"));

console.log(failures === 0 ? "\n✅ CLI flag guard passed" : `\n❌ ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
