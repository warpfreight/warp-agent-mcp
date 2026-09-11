import assert from 'node:assert/strict';
import { registerTools } from '../dist/tools.js';
const handlers = new Map();
const server = { registerTool(name, config, handler) { handlers.set(name, handler); return { update() {} }; } };
let upstreamCalls = 0;
const client = new Proxy({}, { get(_target, name) { return async () => { upstreamCalls++; throw new Error(`Unexpected upstream call: ${String(name)}`); }; } });
registerTools(server, client, () => undefined);
const base = { origin_zip:'90001', destination_zip:'92101', pickup_date:'2026-09-14', pallets:2, weight_lbs_per_pallet:500, commodity:'frozen ice cream' };
for (const name of ['van_quote','box_truck_quote','ftl_quote','ltl_quote','ltl_market_options','compare_modes','multistop_quote']) {
 const r = await handlers.get(name)({...base,pickup_zip:base.origin_zip,stop_zips:["92501"],delivery_zip:base.destination_zip});
 assert.equal(r.isError,true,name);
 assert.match(r.content[0].text,/temperature-controlled|perishable/,name);
}
const batch = await handlers.get('batch_quote')({lanes:[base]});
assert.equal(batch.isError,true); assert.equal(upstreamCalls,0,'Unsupported commodities must not reach pricing');

const rows = [{mode:'ltl',available:true,price_usd:293.38,quote_id:'test-dedicated',transit_days:1,details:{quote_tier:'firm',service:{mode:'ftl'},mode_substituted:{requested:'ltl',served:'ftl',reason:'Dedicated service; equipment assigned at dispatch.'}}},{mode:'ftl',available:true,price_usd:691.44,quote_id:'test-ftl',transit_days:1,details:{quote_tier:'firm'}}];
registerTools(server,{allModesQuote:async()=>({raw:{results:rows},dimsAssumed:true,assumedDimFields:['length_in','width_in','height_in']})},()=>undefined);
const result=await handlers.get('compare_modes')({...base,commodity:'boxed apparel'});
assert.notEqual(result.isError,true);
const data=JSON.parse(result.content.find(c=>c.type==='text'&&c.text.startsWith('{')).text);
assert.equal(data.recommended.mode,'ftl');
assert.equal(data.recommended.requested_mode,'ltl');
assert.equal(data.recommended.quote_id,'test-dedicated');
assert.equal(data.recommended.quote_tier,'firm');
assert.match(data.recommended.mode_label,/Dedicated truck/);
assert.doesNotMatch(result.content[0].text,/LTL \(shared\)/);
assert.equal(data.recommended.mode_substituted.served,'ftl');
// Actual shared LTL keeps its original label and dimension-based downgrade.
delete rows[0].details.mode_substituted; rows[0].details.service.mode='ltl';
const normal=await handlers.get('compare_modes')({...base,commodity:'boxed apparel'});
const n=JSON.parse(normal.content.find(c=>c.type==='text'&&c.text.startsWith('{')).text);
assert.equal(n.recommended.mode,'ltl');assert.equal(n.recommended.mode_label,'LTL (shared)');assert.equal(n.recommended.quote_tier,'indicative');
console.log('PASS: eight commodity entry points block before upstream; substituted and shared service labels, quote identity and tiers remain correct. No network or booking calls.');
