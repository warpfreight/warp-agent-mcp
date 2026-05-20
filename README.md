# warp-agent-mcp

[![npm version](https://img.shields.io/npm/v/warp-agent-mcp.svg)](https://www.npmjs.com/package/warp-agent-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Model Context Protocol (MCP) server for the [Warp](https://wearewarp.com) freight
API. Quote, book, and track LTL, FTL, cargo van, box-truck, and multi-stop
shipments from Claude Desktop, Cursor, Claude Code, or any MCP-compatible AI
agent.

## What it does

20 tools that let an AI agent talk to your Warp account:

| Tool | What it does |
|---|---|
| `warp_van_quote` | Quote a 1–3 pallet cargo van shipment |
| `warp_box_truck_quote` | Quote a 1–12 pallet box truck shipment |
| `warp_ftl_quote` | Quote a full truckload (53' dry van) |
| `warp_ltl_quote` | Quote LTL — Warp's flagship freight product |
| `warp_multistop_quote` | Quote a multi-stop FTL (one truck, multiple stops) |
| `warp_book` | Book any quote by id, with pickup + delivery addresses |
| `warp_multistop_book` | Book a multi-stop FTL with full stop info |
| `warp_track` | Track a shipment by id or order id |
| `warp_events` | Full tracking event timeline for a shipment |
| `warp_cancel` | Attempt to cancel a booking (Warp blocks self-cancel — returns the actual error) |
| `warp_lane_history` | Past shipments on your lanes |
| `warp_list_bookings` | List recent bookings |
| `warp_rate_card` | Your negotiated rate card (if any) |
| `warp_quote_history` | List recent quotes across all sessions |
| `warp_get_invoice` | Invoice for a delivered shipment |
| `warp_get_documents` | Shipment documents (BOL, POD, customs) |
| `warp_login` | Log in from inside the MCP, no portal visit needed |
| `warp_payment_status` | Check whether a card is on file |
| `warp_status` | API health + key validity check |
| `warp_analytics` | Bookings + revenue rollup by source |

## Install

```bash
npm install -g @warpfreight/cli-agent
warp-agent signup
```

That command creates a Warp account, issues you a `wak_live_*` token, saves it
to `~/.warp/config.json`, and auto-wires this MCP into Claude Desktop, Cursor,
and Claude Code. Restart your AI client to load the new tools.

Add a payment method at <https://www.wearewarp.com/agents/account>.

## Manual install (without the CLI)

If you'd rather wire this up by hand, add to Claude Desktop config:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "warp": {
      "command": "bash",
      "args": ["-lc", "npx -y warp-agent-mcp"]
    }
  }
}
```

The MCP reads the API key from `~/.warp/config.json` on every tool invocation,
so `warp-agent login` / `warp-agent signup` take effect without restarting your
AI client.

For Cursor or Claude Code, the same `npx -y warp-agent-mcp` command works in
their respective MCP config files.

## Try it

After install + signup + restart, ask your AI agent:

```
Quote LTL from 90007 to 90038, pickup June 25, 2 pallets at 500 lb.
```

You should get back a `PRICING_*` quote_id with a Warp price plus market
comparisons. Add `Book that quote, pickup at 1234 S Hoover St LA 90007, deliver
to 6464 Sunset Blvd LA 90038.` and the agent will buy the label and return a
tracking number.

## Configuration

| Env var | Purpose |
|---|---|
| `WARP_API_KEY` | API key fallback if `~/.warp/config.json` is missing. Prefer the config file. |
| `WARP_API_URL` | Override the API base URL. Defaults to `https://www.wearewarp.com/api/v1/warp` (warp-site proxy that accepts `wak_*` Bearer tokens). Set to `https://gw.wearewarp.com/api/v1` for direct gateway access with a raw customer key. |

## Requirements

- Node.js 20 or later (the MCP SDK requires native `fetch` and Web Standard APIs)

## Sandbox / test mode

When `warp-agent signup` provisions a new account, you also get a `wak_test_*`
sandbox key saved alongside the live key. Test-mode bookings produce realistic
responses (rates, label PDFs, tracking numbers) without calling carriers or
charging your card. Swap the `api_key` field in `~/.warp/config.json` to use
the sandbox key.

## Companion package

[`@warpfreight/cli-agent`](https://www.npmjs.com/package/@warpfreight/cli-agent)
— the auto-provisioning CLI that installs this MCP into every detected AI
client. Same backend, command-line surface for scripting + CI.

## Contributing

Issues and PRs welcome at <https://github.com/warpfreight/warp-agent-mcp>.

## License

[MIT](./LICENSE) © Warp Technology, Inc.
