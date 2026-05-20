/**
 * Slack notifications for #mcp-cli-tracker
 * Routes through our server-side proxy so the webhook URL
 * is never published inside the npm package.
 */
const PROXY_URL = "https://warp-partner-admin-virid.vercel.app/api/notify";
const NOTIFY_TOKEN = "warp-agent-notify-v1";
function ts() {
    return new Date().toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }) + " PT";
}
function field(label, value) {
    if (!value)
        return null;
    return { type: "mrkdwn", text: `*${label}*\n${value}` };
}
async function post(payload) {
    try {
        await fetch(PROXY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-notify-token": NOTIFY_TOKEN,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(5000),
        });
    }
    catch {
        // Non-fatal — never block user flows
    }
}
export async function notifyQuote(p) {
    const modeLabel = {
        van: "Cargo Van", box_truck: "Box Truck", ftl: "Full Truckload (FTL)",
        ltl: "LTL", bb: "Break & Build", shared_ltl: "Shared LTL",
    };
    const readableMode = modeLabel[p.mode] ?? p.mode.toUpperCase();
    const priceStr = p.price != null
        ? `$${p.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "—";
    const lane = p.origin_zip && p.dest_zip ? `${p.origin_zip} → ${p.dest_zip}` : "—";
    const sourceLabel = p.source === "mcp" ? "MCP (AI Agent)" : "CLI";
    const fields = [
        field("Lane", lane),
        field("Mode", readableMode),
        field("Price", priceStr),
        p.pallets != null ? field("Pallets", String(p.pallets)) : null,
        field("Source", sourceLabel),
        p.carrier ? field("Carrier", p.carrier) : null,
        p.quote_id ? field("Quote ID", `\`${p.quote_id}\``) : null,
        p.customer_email ? field("Customer", p.customer_email) : null,
        field("Time", ts()),
        p.duration_ms != null ? field("Response Time", `${p.duration_ms}ms`) : null,
    ].filter(Boolean);
    await post({
        text: `📦 New Quote — ${lane} (${readableMode}) via ${sourceLabel}`,
        attachments: [{
                color: "#4A90D9",
                blocks: [
                    { type: "header", text: { type: "plain_text", text: `📦 New Quote — ${readableMode}`, emoji: true } },
                    { type: "section", fields: fields.slice(0, 10) },
                ],
            }],
    });
}
export async function notifyBooking(p) {
    const modeLabel = {
        van: "Cargo Van", box_truck: "Box Truck", ftl: "Full Truckload (FTL)",
        ltl: "LTL", bb: "Break & Build", shared_ltl: "Shared LTL",
    };
    const readableMode = p.mode ? (modeLabel[p.mode] ?? p.mode.toUpperCase()) : "Freight";
    const amountStr = p.amount_usd != null
        ? `$${p.amount_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : "—";
    const lane = p.origin_zip && p.dest_zip ? `${p.origin_zip} → ${p.dest_zip}` : "—";
    const sourceLabel = p.source === "mcp" ? "MCP (AI Agent)" : "CLI";
    const trackingUrl = p.tracking_number
        ? `https://tracking.wearewarp.com/${p.tracking_number}`
        : null;
    const fields = [
        field("Lane", lane),
        field("Mode", readableMode),
        field("Amount Charged", amountStr),
        field("Source", sourceLabel),
        p.tracking_number ? field("Tracking", trackingUrl ? `<${trackingUrl}|${p.tracking_number}>` : p.tracking_number) : null,
        p.order_id ? field("Order ID", `\`${p.order_id}\``) : null,
        p.quote_id ? field("Quote ID", `\`${p.quote_id}\``) : null,
        p.carrier ? field("Carrier", p.carrier) : null,
        p.customer_email ? field("Customer", p.customer_email) : null,
        field("Time", ts()),
        p.duration_ms != null ? field("Duration", `${p.duration_ms}ms`) : null,
    ].filter(Boolean);
    await post({
        text: `✅ Booking Confirmed — ${lane} via ${sourceLabel} — ${amountStr}`,
        attachments: [{
                color: "#2EB67D",
                blocks: [
                    { type: "header", text: { type: "plain_text", text: `✅ Booking Confirmed — ${readableMode}`, emoji: true } },
                    { type: "section", fields: fields.slice(0, 10) },
                    ...(trackingUrl ? [{ type: "section", text: { type: "mrkdwn", text: `🔗 *Track:* <${trackingUrl}|${p.tracking_number}>` } }] : []),
                ],
            }],
    });
}
//# sourceMappingURL=slack.js.map