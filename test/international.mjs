// international_*: request shapes sent to warp-site, the keyless refusal,
// option shaping (carrier shown as Warp, price order) and the "unknown, do not
// rebook" handling of a slow booking. No network: fetch is stubbed and the
// tools run against a stub client.
import assert from "node:assert/strict";
process.env.WARP_INTL_TIMEOUT_MS = "200";
const { WarpClient, WarpApiError, BookingPendingError } = await import("../dist/client.js");
const { registerTools } = await import("../dist/tools.js");

const realFetch = globalThis.fetch;

// ── client: endpoints, methods and bodies ─────────────────────
const client = new WarpClient("https://www.wearewarp.com/api/v1/warp", () => "wak_test_x");
let seen;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization };
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
await client.internationalQuote({ pickupDate: "2026-11-02" });
assert.equal(seen.url, "https://www.wearewarp.com/api/v1/international/quote");
assert.equal(seen.method, "POST");
assert.equal(seen.auth, "Bearer wak_test_x");
await client.internationalSettings();
assert.equal(seen.url, "https://www.wearewarp.com/api/v1/international/settings");
await client.internationalCustoms("P-01744-2641");
assert.equal(seen.method, "GET");
assert.equal(seen.url, "https://www.wearewarp.com/api/v1/international/orders/P-01744-2641/customs");
await client.internationalCustoms("P-01744-2641", { incoterm: "EXW" });
assert.equal(seen.method, "PUT");
assert.deepEqual(seen.body, { incoterm: "EXW" });

// internationalBook: a timeout is unknown, an upstream 400 is a rejection
const keepAlive = setTimeout(() => {}, 5000);
globalThis.fetch = (url, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(init.signal.reason)));
await assert.rejects(client.internationalBook({ quoteId: "01O" }), (e) => e instanceof BookingPendingError && e.reason === "timeout");
clearTimeout(keepAlive);
globalThis.fetch = async () => new Response(JSON.stringify({ code: "required_field_missing" }), { status: 400 });
await assert.rejects(client.internationalBook({ quoteId: "01O" }), (e) => e instanceof WarpApiError && e.status === 400);
globalThis.fetch = realFetch;

// ── tools ─────────────────────────────────────────────────────
const handlers = new Map();
const server = { registerTool(name, _config, handler) { handlers.set(name, handler); return { update() {} }; } };
const calls = [];
let bookResult = async () => ({ trackingNumber: "2E2EWQATEF8K", orderId: "01H3" });
const stubClient = {
  internationalQuote: async (b) => {
    calls.push(["quote", b]);
    return { id: "01Q", options: [
      { id: "01AIR", carrierName: "Delta Airlines", source: "exfreight", rate: 914.2, currency: "USD", transitTime: 691200, international: { mode: "AIR", modeDetail: "STANDARD", doorService: "door_to_port", portChargesAcknowledgementRequired: true, originAirport: "LAX", destinationAirport: "PVG" } },
      { id: "01SEA", carrierName: "Craft Multi LCL", source: "exfreight", rate: 243.89, currency: "USD", transitTime: 3715200, international: { mode: "OCEAN", modeDetail: "LCL", doorService: "door_to_door", portChargesAcknowledgementRequired: false, originPort: "USLAX", destinationPort: "CNSGH" } },
    ] };
  },
  internationalBook: async (b) => { calls.push(["book", b]); return bookResult(); },
  internationalCustoms: async (id, update) => { calls.push(["customs", { id, update }]); return { orderId: id }; },
  internationalSettings: async () => ({ internationalEnabled: true, doorServices: ["door_to_door"] }),
  internationalCountries: async () => ({ message: "Success", data: { list_data: [{ code: "CN", name: "China", postalRequired: false }], total: 1, denylist: ["CU"] } }),
};
const origin = { country: "us", zipcode: "90021" };
const destination = { country: "CN", zipcode: "200120", city: "Shanghai" };
const items = [{ name: "Machine parts", quantity: 2, length_in: 48, width_in: 40, height_in: 50, weight_lbs_per_unit: 400 }];
const window = { from: "2026-11-02T16:00:00.000Z", to: "2026-11-02T23:00:00.000Z" };
const stop = (country, zipcode) => ({ contact_name: "Li Wei", phone: "+862150000000", street: "1000 Lujiazui Ring Rd", city: "Shanghai", state: "Shanghai", country, zipcode, window });

// keyless: refused before any call
registerTools(server, stubClient, () => undefined);
assert.equal((await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination, items }, {})).isError, true);
assert.equal((await handlers.get("international_book")({ option_id: "01SEA", pickup: stop("US", "90021"), delivery: stop("CN", "200120"), items })).isError, true);
assert.equal(calls.length, 0, "keyless international calls must not reach warp-site");

registerTools(server, stubClient, () => "wak_live_x");
const q = await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination, items }, {});
assert.notEqual(q.isError, true);
const [, quoteBody] = calls.find(([k]) => k === "quote");
assert.deepEqual(quoteBody.pickupInfo, { country: "US", zipcode: "90021" });
assert.equal(quoteBody.items[0].totalWeight, 800, "totalWeight is quantity x per-unit weight");
assert.equal(quoteBody.items[0].stackable, false);
const shown = JSON.parse(q.content[0].text.split("\n\n")[0]);
assert.deepEqual(shown.options.map((o) => o.option_id), ["01SEA", "01AIR"], "cheapest first");
assert.equal(shown.options[1].transit_days, 8, "gw transitTime is seconds");
assert.equal(shown.options[0].transit_days, 43);

const s = JSON.parse((await handlers.get("international_settings")({ country: "cn" })).content[0].text);
assert.equal(s.supported_countries, 1);
assert.equal(s.country.name, "China");
assert.deepEqual(s.blocked_countries, ["CU"]);
assert.equal(shown.options[1].destination_port, "PVG");
assert.doesNotMatch(q.content[0].text, /Delta|Craft|exfreight/i, "forwarder carriers and source are not shown");
assert.ok(shown.options.every((o) => o.carrier === "Warp"));

const b = await handlers.get("international_book")({ option_id: "01AIR", pickup: stop("US", "90021"), delivery: stop("CN", "200120"), items, port_charges_acknowledged: true });
assert.notEqual(b.isError, true);
const [, bookBody] = calls.find(([k]) => k === "book");
assert.equal(bookBody.quoteId, "01AIR");
assert.equal(bookBody.deliveryInfo.contactPhone, "+862150000000");
assert.equal(bookBody.deliveryInfo.address.country, "CN");
assert.deepEqual(bookBody.internationalInfo, { portChargesAcknowledged: true });
assert.deepEqual(bookBody.pickupInfo.timeWindow, window);

// cargo is described exactly one way; containers and volume go as packaging
calls.length = 0;
assert.equal((await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination, items, containers: [{ size: "40'HC", count: 1, commodity: "Furniture", weight_lbs: 12000 }] }, {})).isError, true);
assert.equal((await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination }, {})).isError, true);
assert.equal(calls.length, 0);
await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination, containers: [{ size: "40'HC", count: 1, commodity: "Furniture", weight_lbs: 12000 }] }, {});
assert.deepEqual(calls[0][1].packaging, { containers: [{ size: "40'HC", count: 1, commodity: "Furniture", weight: { value: 12000, unit: "lbs" } }] });
assert.equal(calls[0][1].items, undefined);
await handlers.get("international_quote")({ pickup_date: "2026-11-02", origin, destination, volume: { total_cubic_ft: 350, max_height_in: 60, total_weight_lbs: 3000, description: "Furniture" } }, {});
assert.deepEqual(calls[1][1].packaging.volumetric, { totalVolume: { value: 350, unit: "cubic_ft" }, maxHeight: { value: 60, unit: "inch" }, weight: { value: 3000, unit: "lbs" }, description: "Furniture" });

// typed customs map to gw's internationalInfo; items may be omitted for a packaging quote
calls.length = 0;
await handlers.get("international_book")({
  option_id: "01FCL",
  pickup: { ...stop("US", "90021"), instructions: "Dock 4" },
  delivery: stop("CN", "200120"),
  customs: {
    no_hazmat: true,
    shipper_tax_id: "123456789",
    importer_registration_number: "12345678000199",
    eei_authorization: true,
    commodities: [{ description: "Office furniture", schedule_b: "9403300000", country_of_origin: "us", value_usd: 18000, quantity: 120, weight_lbs: 12000 }],
    importer_of_record: { name: "Shanghai Broker Co", street: "1 Bund", city: "Shanghai", country: "cn", contact_name: "Wang", phone: "+862150000001" },
  },
});
const fcl = calls.find(([k]) => k === "book")[1];
assert.equal(fcl.items, undefined);
assert.equal(fcl.pickupInfo.instructions, "Dock 4");
assert.deepEqual(fcl.internationalInfo, {
  shipper: { taxId: "123456789" },
  consignee: { importerRegistrationNumber: "12345678000199" },
  importerOfRecord: { name: "Shanghai Broker Co", address: { street: "1 Bund", city: "Shanghai", countryAlpha2Code: "CN" }, contact: { name: "Wang", phone: "+862150000001" } },
  eeiAuthorization: true,
  declarations: { noHazmat: true },
  commodities: [{ description: "Office furniture", scheduleB: "9403300000", countryOfOrigin: "US", value: { amount: 18000, currency: "USD" }, quantity: 120, weight: { value: 12000, unit: "lbs" } }],
});

calls.length = 0;
await handlers.get("international_customs")({ order_id: "P-1" });
assert.equal(calls[0][1].update, undefined, "no fields means a read");
await handlers.get("international_customs")({ order_id: "P-1", customs: { itn: "X20261030123456", commodities: [{ description: "Parts", hts_code: "8483405000" }] } });
assert.deepEqual(calls[1][1].update, { itn: "X20261030123456", commodities: [{ description: "Parts", htsCode: "8483405000" }] });

bookResult = async () => ({ orderId: "01H4", paymentLink: "https://pay.example/x" });
assert.match((await handlers.get("international_book")({ option_id: "01SEA", pickup: stop("US", "90021"), delivery: stop("CN", "200120"), items })).content[0].text, /pay\.example/);

bookResult = async () => { throw new BookingPendingError("01SEA", "timeout"); };
const pending = await handlers.get("international_book")({ option_id: "01SEA", pickup: stop("US", "90021"), delivery: stop("CN", "200120"), items });
assert.notEqual(pending.isError, true);
assert.match(pending.content[0].text, /Do NOT book it again/);

console.log("international: ok");
