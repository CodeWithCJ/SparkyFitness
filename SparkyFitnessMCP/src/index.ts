import "./load_env.js"; // MUST BE FIRST

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema, 
  ErrorCode, 
  McpError 
} from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";

import { nutritionTools, handleNutritionTool } from "./tools/food/index.js";
import { exerciseTools, handleExerciseTool } from "./tools/exercise/index.js";
import { checkinTools, handleCheckinTool } from "./tools/checkin/index.js";
import { coachTools, handleCoachTool } from "./tools/coach/index.js";
import { proactiveTools, handleProactiveTool } from "./tools/engagement/index.js";
import { visionTools, handleVisionTool } from "./tools/vision/index.js";
import { devTools, handleDevTool } from "./tools/dev/index.js";
import { MOCK_USER_ID } from "./config.js";

console.error(`[MCP] Active Mock User ID: ${MOCK_USER_ID}`);

const handlers = [
  handleNutritionTool,
  handleExerciseTool,
  handleCheckinTool,
  handleCoachTool,
  handleProactiveTool,
  handleVisionTool,
  handleDevTool,
];

const allTools = [
  ...nutritionTools,
  ...exerciseTools,
  ...checkinTools,
  ...coachTools,
  ...proactiveTools,
  ...visionTools,
  ...devTools,
];

/**
 * Factory function to create a new MCP Server instance.
 * Using the low-level Server class to support raw JSON schemas (McpServer defaults them to empty).
 * Called once per request in stateless mode (SDK requirement).
 */
function createMCPServer() {
  const server = new Server(
    { name: "sparky-fitness-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // Register the tool listing handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }))
    };
  });

  // Register the tool calling handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    for (const handler of handlers) {
      const result = await handler(name, args);
      if (result) return result;
    }

    throw new McpError(
      ErrorCode.MethodNotFound,
      `Tool not found: ${name}`
    );
  });

  return server;
}

const app = express();
app.use(cors());
app.use(express.json());

/**
 * MCP Streamable HTTP handler.
 *
 * IMPORTANT: The SDK's stateless transport CANNOT be reused across requests
 * (it throws "Stateless transport cannot be reused across requests").
 * We must create a fresh Server + transport per request.
 *
 * We also force-inject the correct Accept header so clients like n8n that only
 * send "Accept: application/json" don't get a 406 from the SDK's strict validation
 * (which requires BOTH application/json AND text/event-stream).
 */
const handleMcpRequest = async (req: express.Request, res: express.Response) => {
  console.log(`[MCP] Request: ${req.method} ${req.path}`);

  // Force the Accept header to satisfy SDK validation.
  req.headers['accept'] = 'application/json, text/event-stream';

  try {
    // Create a fresh server + transport per request (stateless mode requirement)
    const server = createMCPServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true,      // return JSON directly instead of SSE streams
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // Clean up after the response is sent
    res.on("finish", () => {
      transport.close().catch(() => {});
    });
  } catch (error) {
    console.error("[MCP] Transport error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal Server Error" },
        id: null,
      });
    }
  }
};

app.all("/mcp", handleMcpRequest);

// Simple tools discovery endpoint (no MCP protocol overhead)
app.get("/mcp/tools", (_req, res) => {
  res.json({ tools: allTools });
});

const PORT = process.env.SPARKY_FITNESS_MCP_PORT || process.env.PORT || 5435;

app.listen(PORT, () => {
  console.log(`Sparky MCP Server running on port ${PORT} (Streamable HTTP mode)`);
});
