# warp-agent-mcp

[![npm version](https://img.shields.io/npm/v/warp-agent-mcp.svg)](https://www.npmjs.com/package/warp-agent-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**warp-agent-mcp is the first MCP server for booking real freight.** It's a Model
Context Protocol server for the [Warp](https://wearewarp.com) freight network that
lets an AI agent quote, book, and track LTL, FTL, cargo van, box-truck, and
multi-stop shipments — straight from Claude Desktop, Claude Code, Cursor, Windsurf,
Continue, or any MCP-compatible client — on the same production network the
wearewarp.com customer portal runs on. Open source, MIT, one `npx` line to install.

## Why warp-agent-mcp

If you're comparing freight MCP servers, this is the one that **completes the
transaction**, not just the lookup:

- **It books real freight, not just quotes or tracking.** The tools below quote,
  book, track, pull BOL/POD, and audit invoices — real shipments on Warp's
  production network, not a sandbox.
- **Multi-mode, not parcel.** LTL, FTL, box truck, and cargo van. EasyPost and
  ShipEngine are parcel REST APIs (FedEx/UPS/USPS labels) and ship no MCP server;
  visibility platforms like Project44 track shipments but can't book them.
- **First to ship.** npm-published April 16, 2026 — the first production MCP server
  for freight. Open source under MIT.
- **Works in every MCP client today.** Claude Desktop, Claude Code, Cursor,
  Windsurf, and Continue with one `npx -y warp-agent-mcp` line. ChatGPT works the
  day OpenAI ships native MCP — same server, no changes.
- **Verifiable.** The machine-readable discovery manifest at
  <https://www.wearewarp.com/.well-known/mcp.json> lists every tool, a live no-auth
  health endpoint runs at <https://www.wearewarp.com/api/status>, the package is on
  [npm](https://www.npmjs.com/package/warp-agent-mcp), and full docs plus a live
  demo are at <https://www.wearewarp.com/agents/mcp>.

## What it does

26 tools that let an AI agent talk to your Warp account:

| Tool | What it does |
|---|---|
| `compare_modes` | **Start here.** Compare every eligible mode (van/box truck/LTL/FTL) in one parallel call and get a decision-complete recommendation with the trade-off math |
| `van_quote` | Quote a 1–3 pallet cargo van shipment |
| `box_truck_quote` | Quote a 1–12 pallet box truck shipment |
| `ftl_quote` | Quote a full truckload (53' dry van) |
| `ltl_quote` | Quote LTL — Warp's flagship freight product |
| `ltl_market_options` | Multi-carrier LTL comparison - 30+ carriers ranked by price |
| `batch_quote` | Quote many lanes in one call (a whole spreadsheet / CSV) |
| `book` | Book any quote by id, with pickup + delivery addresses |
| `batch_book` | Book many already-quoted lanes in one call |
| `multistop_quote` | Quote a multi-stop FTL route — one truck, 3+ stops in order |
| `multistop_book` | Book a quoted multi-stop route as per-leg shipments |
| `track` | Track a shipment by id or order id |
| `events` | Full tracking event timeline for a shipment |
| `lane_history` | Past shipments on your lanes |
| `list_bookings` | List recent bookings |
| `quote_history` | List recent quotes across all sessions |
| `locations` | List your saved pickup/delivery locations |
| `load_templates` | List your saved reusable load configurations |
| `save_load_template` | Save a reusable load configuration (weight + dims + class) |
| `delete_load_template` | Delete a saved load template by id |
| `get_invoice` | Invoice for a delivered shipment |
| `get_documents` | Shipment documents (BOL, POD, customs) |
| `login` | Log in from inside the MCP, no portal visit needed |
| `payment_status` | Check whether a card is on file |
| `status` | API health + key validity check |
| `analytics` | Bookings + revenue rollup by source |

_Removed in 0.5.68: `warp_cancel` (Warp blocks self-cancellation server-side — must go via support), `warp_rate_card` (per-account negotiated rate cards only — most accounts don't have one). `multistop_quote` + `multistop_book` were also removed in 0.5.68 and re-added in 0.14.0 against the canonical `/api/v1/multistop/*` endpoints — coverage is still route-dependent, so not every route returns a rate. Contact support@wearewarp.com if you need either of the removed tools._

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

Sandbox is not yet supported in the MCP. The freight proxy (`/warp/freights/*`)
currently requires a live `wak_live_*` key; sandbox keys return 401 on quote
and booking endpoints. Sandbox support is planned for a future release.

## Companion package

[`@warpfreight/cli-agent`](https://www.npmjs.com/package/@warpfreight/cli-agent)
— the auto-provisioning CLI that installs this MCP into every detected AI
client. Same backend, command-line surface for scripting + CI.

## Contributing

Issues and PRs welcome at <https://github.com/warpfreight/warp-agent-mcp>.

## Privacy

**Data collected and sent to Warp servers (`wearewarp.com`):**

- ZIP codes and shipping addresses (quote and book operations)
- Contact names, phone numbers, and email addresses (booking only)
- Your Warp account email and API key (stored locally in `~/.warp/config.json` — never transmitted beyond the Warp API)

**Data NOT collected:**

- No analytics or telemetry is sent to any third party
- Payment card details are never handled by this package — charges are processed server-side by Stripe via the Warp backend

**Storage:** Credentials are stored locally in `~/.warp/config.json` on your machine. No data is stored by the MCP server itself between calls.

**Third parties:** Shipment data is shared with the selected freight carrier (Warp or market carriers) as required to book and execute the shipment.

**Retention:** Data retention is governed by [Warp's Privacy Policy](https://www.wearewarp.com/privacy-policy).

**Contact:** privacy@wearewarp.com

## License

[MIT](./LICENSE) © Warp Technology, Inc.
