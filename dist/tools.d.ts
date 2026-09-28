import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WarpClient } from "./client.js";
/** What the agent must do when a booking's outcome is not known yet. */
export declare function bookingPendingText(quoteId: string): string;
export declare function registerTools(server: McpServer, client: WarpClient, getApiKey: () => string | undefined): void;
