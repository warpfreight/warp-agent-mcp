// Generate manifest tool metadata from real MCP discovery, without API calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerTools } from '../dist/tools.js';
const manifestUrl=new URL('../manifest.json',import.meta.url);
const original=readFileSync(manifestUrl,'utf8');
const manifest=JSON.parse(original);
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const server=new McpServer({name:'manifest-discovery',version:pkg.version});
registerTools(server,new Proxy({}, {get(){return ()=>{throw Error('Manifest generation must never call upstream');};}}),()=>undefined);
const client=new Client({name:'manifest-discovery',version:'1'});
const [a,b]=InMemoryTransport.createLinkedPair();
try {
 await server.connect(a); await client.connect(b);
 const {tools}=await client.listTools();
 manifest.version=pkg.version;
 manifest.tools=tools.map(({name,description})=>({name,description}));
 const generated=JSON.stringify(manifest,null,2)+'\n';
 if(process.argv.includes('--check')) {
  if(generated!==original) throw Error('Manifest drift: run npm run sync:manifest after building.');
 } else writeFileSync(manifestUrl,generated);
 console.log(`Manifest ${process.argv.includes('--check')?'verified':'generated'}: ${tools.length} tools, ${pkg.version}`);
} finally {await client.close();await server.close();}
