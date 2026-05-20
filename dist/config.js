/**
 * Read / merge / write ~/.warp/config.json.
 *
 * Config is shared across the CLI and MCP. New fields are merged in without
 * clobbering existing ones, so warp_login + warp_shopify_connect + warp_slack_connect
 * can each write their own slice without overwriting the API key.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
const CONFIG_DIR = join(homedir(), ".warp");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export function readConfig() {
    try {
        const raw = readFileSync(CONFIG_PATH, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return {};
    }
}
export function writeConfig(patch) {
    const current = readConfig();
    const merged = { ...current, ...patch };
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
    return merged;
}
//# sourceMappingURL=config.js.map