import assert from 'node:assert/strict';
import { consolidateWithModes } from '../dist/consolidation.js';
const load={origin_zip:'19060',destination_zip:'10001',pickup_date:'2026-10-22',pallets:2,weight_lbs_per_pallet:500,length:48,width:40,height:48};
const params={loads:Array.from({length:4},()=>({...load}))};
const original={proposals:[{lane:{origin_zip:'19060',destination_zip:'10001'},pickup_date:load.pickup_date,loads:params.loads.map((l,i)=>({index:i,ltl_quote:{quote_id:`separate-${i}`,price_usd:453.133021}})),consolidated_truck:{mode:'ftl',quote_id:'old-ftl',price_usd:1365.81},savings_usd:446.72,recommended:true}]};
const row=(mode,price,id,details={})=>({mode,available:true,price_usd:price,quote_id:id,transit_days:1,expires_at:'2026-10-19T15:53:00Z',details:{quote_tier:'firm',...details}});
const rows=[row('ftl',1365.81,'ftl'),row('box_truck',743.33,'box'),row('ltl',698.47,'dedicated',{mode_substituted:{served:'ftl'},delivery_date:'2026-10-23'}),{mode:'cargo_van',available:false,reason:'8 pallets exceeds 3'}];
let calls=[];
const client={consolidate:async()=>structuredClone(original),allModesQuote:async(input)=>{calls.push(input);return {raw:{results:rows},dimsAssumed:false}},ltlQuote:async()=>{throw Error('Unexpected repricing')}};
let r=await consolidateWithModes(client,params),p=r.proposals[0];
assert.equal(calls.length,1);assert.equal(calls[0].pallets,8);assert.equal(calls[0].weight_lbs_per_pallet,500);assert.equal(calls[0].stackable,false);
assert.equal(p.consolidated_truck.quote_id,'dedicated');assert.equal(p.consolidated_truck.mode,'ftl');assert.equal(p.consolidated_truck.requested_mode,'ltl');assert.match(p.consolidated_truck.vehicle,/equipment assigned/);
assert.equal(p.consolidated_truck.book_tool_call.args.quote_id,'dedicated');assert.equal(p.consolidated_truck.expires_at,'2026-10-19T15:53:00Z');
assert.equal(p.savings_usd,1114.06);assert.equal(p.savings_pct,61.5);assert.equal(r.total_savings_usd,1114.06);assert.equal(p.recommended,true);assert.equal(p.combined_options.length,4);assert.equal(p.original_ftl_comparison.consolidated_truck.quote_id,'old-ftl');
assert.equal(original.proposals[0].consolidated_truck.quote_id,'old-ftl');
// Partial baseline must never turn into invented savings.
const broken=structuredClone(original);broken.proposals[0].loads[1].ltl_quote={error:'no rate'};
r=await consolidateWithModes({...client,consolidate:async()=>broken},params);assert.equal(r.proposals[0].savings_usd,null);assert.equal(r.total_savings_usd,0);
// Timeouts and mixed manifests cannot silently fall back to recommending FTL.
r=await consolidateWithModes({...client,allModesQuote:async()=>{throw Error('timeout')}},params);assert.equal(r.proposals[0].recommended,false);assert.equal(r.proposals[0].comparison_complete,false);
const mixed=structuredClone(params);mixed.loads[1].height=72;calls=[];
r=await consolidateWithModes(client,mixed);assert.equal(calls.length,0);assert.equal(r.proposals[0].recommended,false);assert.match(r.proposals[0].pricing_note,/Mixed/);
// Reprice nonstandard dimensions on BOTH sides, not only the combined side.
const tall={loads:params.loads.map(l=>({...l,height:60}))};let repriced=0;
r=await consolidateWithModes({...client,ltlQuote:async input=>{assert.equal(input.height_in,60);repriced++;return {quote_id:'tall',price_usd:500}}},tall);
assert.equal(repriced,4);assert.equal(r.proposals[0].separate_ltl_total_usd,2000);assert.equal(r.proposals[0].savings_usd,1301.53);
// Assumed dimensions cannot be advertised as firm.
const assumed={loads:params.loads.map(({length,width,height,...l})=>l)};
r=await consolidateWithModes(client,assumed);assert.equal(r.proposals[0].quote_tier,'indicative');
// Cheapest valid quote wins; missing mode response, invalid prices and no IDs do not imply completeness.
r=await consolidateWithModes({...client,allModesQuote:async()=>({raw:{results:[row('ftl',2000,'expensive'),row('ltl',-1,'bad'),row('box_truck',1,'' )]},dimsAssumed:false})},params);
assert.equal(r.proposals[0].consolidated_truck.quote_id,'expensive');assert.equal(r.proposals[0].comparison_complete,false);assert.equal(r.proposals[0].recommended,false);assert.ok(r.proposals[0].savings_usd<0);
r=await consolidateWithModes({...client,allModesQuote:async()=>({raw:{results:[]},dimsAssumed:false})},params);assert.equal(r.proposals[0].savings_usd,null);
r=await consolidateWithModes({...client,consolidate:async()=>({proposals:[],unconsolidated:[{index:0,reason:'no_lane_partner'}]})},params);assert.equal(r.proposals.length,0);assert.equal(r.unconsolidated.length,1);
console.log('consolidation: regression, substitutions, failures, dimensions and coverage passed');
// Verify the actual MCP handler dispatches the new comparison automatically.
const { registerTools } = await import('../dist/tools.js');
const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = await import('@modelcontextprotocol/sdk/inMemory.js');
const server=new McpServer({name:'consolidation-test',version:'1'});
const guarded=new Proxy(client,{get(target,key){if(key in target)return target[key];return ()=>{throw Error(`Unexpected action: ${String(key)}`)}}});
registerTools(server,guarded,()=>undefined);
const [a,b]=InMemoryTransport.createLinkedPair();const mcp=new Client({name:'test',version:'1'});
await server.connect(a);await mcp.connect(b);
const tools=await mcp.listTools();assert.equal(tools.tools.find(t=>t.name==='consolidate').annotations.readOnlyHint,true);
const result=await mcp.callTool({name:'consolidate',arguments:params});assert.notEqual(result.isError,true);
assert.equal(JSON.parse(result.content[0].text).proposals[0].consolidated_truck.quote_id,'dedicated');
await mcp.close();await server.close();
console.log('consolidation: real MCP dispatch passed without any booking method');
const limited=rows.map(r=>r.mode==='box_truck'?{mode:'box_truck',available:false,code:'RATE_LIMITED',reason:'Daily quote limit reached; retry later'}:r);
r=await consolidateWithModes({...client,allModesQuote:async()=>({raw:{results:limited},dimsAssumed:false})},params);
assert.equal(r.proposals[0].consolidated_truck.quote_id,'dedicated');assert.equal(r.proposals[0].comparison_complete,false);assert.equal(r.proposals[0].recommended,false);assert.equal(r.total_savings_usd,0);
console.log('consolidation: rate-limited modes never count as a complete comparison');
