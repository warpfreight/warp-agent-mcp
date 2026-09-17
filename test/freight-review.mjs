import assert from 'node:assert/strict';
import { compareFreightCosts } from '../dist/workflows.js';
import { registerTools } from '../dist/tools.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
const row = {shipment_id:'A',baseline_amount_usd:1401.31,candidate_amount_usd:913,baseline_source:'SAIA invoice 6',candidate_source:'quote example',baseline_kind:'historical_invoice',candidate_kind:'quote',shipment_requirements:'matched',included_charges:'matched',service_requirements:'matched',comparison_evidence:'Historical benchmark; same load and required services. Quote timing differs.'};
let r=compareFreightCosts({rows:[row]});
assert.equal(r.comparisons[0].cost_difference_usd,488.31);
assert.equal(r.comparisons[0].cost_difference_percent,34.85);
assert.equal(r.totals[1].net_cost_difference_usd,null);
r=compareFreightCosts({rows:[row,{...row,shipment_id:'B',baseline_amount_usd:100,candidate_amount_usd:600},{...row,shipment_id:'C',included_charges:'unknown'},{...row,shipment_id:'D',candidate_kind:'final_invoice'}]});
assert.equal(r.totals[0].net_cost_difference_usd,-11.69,'Losses must offset gains');
assert.equal(r.totals[1].net_cost_difference_usd,488.31,'Do not mix final invoices and quotes');
assert.equal(r.excluded_shipments,1);
assert.equal(r.comparisons[2].cost_difference_usd,null);
assert.equal(compareFreightCosts({rows:[{...row,baseline_amount_usd:0}]}).comparisons[0].cost_difference_percent,null);
for(const rows of [[row,row],[{...row,baseline_amount_usd:-1}],[{...row,baseline_amount_usd:1.001}],[{...row,baseline_source:''}],Array(51).fill(row)]) assert.throws(()=>compareFreightCosts({rows}));
// Exercise real MCP discovery, validation and dispatch, with no upstream calls.
const server = new McpServer({name:'test',version:'1'});
const noUpstream=new Proxy({}, {get(){ return ()=>{throw Error('Unexpected upstream call');}; }});
registerTools(server,noUpstream,()=> 'test-key-not-real');
const [a,b]=InMemoryTransport.createLinkedPair();
const client=new Client({name:'test',version:'1'});
await server.connect(a); await client.connect(b);
const tools=await client.listTools();
assert.ok(tools.tools.find(t=>t.name==='freight_workflow').annotations.readOnlyHint);
for (const workflow of ['shipment_intake','weekly_freight_review','invoice_review']) {
 const out=await client.callTool({name:'freight_workflow',arguments:{workflow}});
 const data=JSON.parse(out.content[0].text); assert.ok(data.starter_prompt); assert.match(data.rules.join(' '),/NOT compare every mode/);
}
assert.equal((await client.callTool({name:'compare_freight_costs',arguments:{rows:[row,row]}})).isError,true);
assert.equal((await client.callTool({name:'compare_freight_costs',arguments:{rows:[{...row,baseline_amount_usd:'1401'}]}})).isError,true);
const good=await client.callTool({name:'compare_freight_costs',arguments:{rows:[row]}});
assert.equal(JSON.parse(good.content[0].text).comparisons[0].cost_difference_usd,488.31);
const originalFetch=globalThis.fetch;
try {
 for(const status of [401,429,500]) {
  globalThis.fetch=async()=>new Response('{}',{status});
  const out=await client.callTool({name:'payment_status',arguments:{}});
  assert.equal(out.isError,true); const data=JSON.parse(out.content[0].text);
  assert.equal(data.status,'unknown');assert.equal(data.retryable,status!==401);assert.equal(data.has_card,undefined);
 }
 globalThis.fetch=async()=>{throw Error('timeout');};
 assert.equal((await client.callTool({name:'payment_status',arguments:{}})).isError,true);
 globalThis.fetch=async()=>new Response(JSON.stringify({has_card:false,onboard_url:'https://www.wearewarp.com/agents/account'}));
 const out=await client.callTool({name:'payment_status',arguments:{}});
 assert.equal(JSON.parse(out.content[0].text).has_card,false);assert.notEqual(out.isError,true);
} finally {globalThis.fetch=originalFetch;await client.close();await server.close();}
console.log('PASS: cost math, losses, evidence exclusions, duplicate protection, protocol schemas, workflows, and payment failures. No live network or booking calls.');
