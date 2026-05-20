#!/usr/bin/env node
/**
 * MCP launcher — reads API key from ~/.warp/config.json and starts the server.
 * This runs as the MCP command so it inherits the real HOME and filesystem access,
 * unlike the bundled server which may run in a sandboxed context.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Point at dist/ (built from src/ at version-bump time) instead of the pre-baked
// bundle/ artifact. bundle/ was hand-rolled and prone to going stale relative
// to src/; dist/ is rebuilt by `npm run build` so what ships matches the source.
const bundlePath = join(__dirname, "..", "dist", "index.js");

// Read API key from ~/.warp/config.json
function getApiKey() {
  const homes = [
    process.env.HOME,
    homedir(),
    process.env.USER ? `/Users/${process.env.USER}` : null,
    process.env.LOGNAME ? `/Users/${process.env.LOGNAME}` : null,
  ].filter(Boolean);

  for (const h of homes) {
    try {
      const cfg = JSON.parse(readFileSync(join(h, ".warp", "config.json"), "utf8"));
      if (cfg.api_key) return cfg.api_key;
    } catch {}
  }
  return null;
}

// Do NOT embed the key in env — the bundle reads ~/.warp/config.json fresh
// on every tool call so CLI login/signup takes effect without MCP restart.
const child = spawn(process.execPath, [bundlePath], {
  stdio: "inherit",
  env: {
    ...process.env,
    // Clear any stale WARP_API_KEY that might have leaked in from the shell
    WARP_API_KEY: "",
    WARP_RAW_KEY: "1",
    WARP_API_URL: "https://www.wearewarp.com/api/v1/warp",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
