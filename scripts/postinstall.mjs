/**
 * postinstall — auto-configures Claude Desktop on install.
 * Adds the warp MCP entry to claude_desktop_config.json if not already there.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const home = process.env.HOME || homedir();

// Claude Desktop config paths by platform
const claudeConfigPaths = [
  join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"), // macOS
  join(home, "AppData", "Roaming", "Claude", "claude_desktop_config.json"),              // Windows
  join(home, ".config", "Claude", "claude_desktop_config.json"),                          // Linux
];

const configPath = claudeConfigPaths.find(p => existsSync(p)) || claudeConfigPaths[0];
const configDir = join(configPath, "..");

// Find node executable
function findNode() {
  const candidates = [
    process.execPath, // the node running this script
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const p of candidates) {
    try {
      if (p) return p;
    } catch {}
  }
  return "node";
}

// Find the bundle
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
const __dirname = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(__dirname, "..", "bundle", "index.js");

// Read the API key from ~/.warp/config.json if available
let apiKey = "";
try {
  const warpConfig = JSON.parse(readFileSync(join(home, ".warp", "config.json"), "utf8"));
  apiKey = warpConfig.api_key || "";
} catch {
  // Not logged in yet — user needs to run warp-agent login
}

// Find warp-agent-mcp bin path
let binPath = "warp-agent-mcp";
try {
  binPath = execSync("which warp-agent-mcp", { encoding: "utf8" }).trim() || binPath;
} catch {}

// Use run.mjs directly with the node that's running this script
const nodePath = process.execPath;
const runScript = join(__dirname, "run.mjs");

// The MCP entry — use absolute node path + run.mjs so Claude Desktop can find it
const warpEntry = {
  command: nodePath,
  args: [runScript],
};

let config = {};
try {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} catch {
  // Config doesn't exist yet — create it
}

// Check if already configured correctly
const existing = config?.mcpServers?.warp;
if (existing?.command === warpEntry.command &&
    JSON.stringify(existing?.args) === JSON.stringify(warpEntry.args)) {
  console.log("✓ Warp MCP already configured in Claude Desktop");
  process.exit(0);
}

// Add/update the warp entry
config.mcpServers = config.mcpServers || {};
config.mcpServers.warp = warpEntry;

try {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  console.log("\n✓ Warp MCP configured for Claude Desktop");
  console.log(`  Config file: ${configPath}`);
  console.log(`  Command: ${warpEntry.command}`);
  console.log(`  Args: ${JSON.stringify(warpEntry.args)}`);
  console.log("\nNext steps:");
  console.log("  1. Make sure you're logged in: warp-agent login");
  console.log("  2. Restart Claude Desktop completely (Cmd+Q then reopen)");
  console.log("  3. Ask Claude: get me an LTL quote from 90007 to 90038\n");
} catch (err) {
  console.log("\nCould not auto-configure Claude Desktop.");
  console.log("Add this manually to ~/Library/Application Support/Claude/claude_desktop_config.json:");
  console.log(JSON.stringify({ mcpServers: { warp: warpEntry } }, null, 2));
}
