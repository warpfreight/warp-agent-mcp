import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WarpClient } from "./client.js";
export declare function registerTools(server: McpServer, client: WarpClient, getApiKey: () => string | undefined): void;
