import "./load_env.js"; // MUST BE FIRST

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";

import { nutritionTools, handleNutritionTool } from "./tools/food/index.js";
import { exerciseTools, handleExerciseTool } from "./tools/exercise/index.js";
import { biometricTools, handleBiometricTool } from "./tools/biometrics.js";
import { coachTools, handleCoachTool } from "./tools/coach.js";
import { proactiveTools, handleProactiveTool } from "./tools/engagement.js";
import { visionTools, handleVisionTool } from "./tools/vision.js";
import { devTools, handleDevTool } from "./tools/dev.js";
import { MOCK_USER_ID } from "./config.js";

console.error(`[MCP] Active Mock User ID: ${MOCK_USER_ID}`);

/**
 * Factory function to create a new MCP Server instance.
 */
function createMCPServer() {
  const server = new Server(
    {
      name: "sparky-fitness-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...nutritionTools,
        ...exerciseTools,
        ...biometricTools,
        ...coachTools,
        ...proactiveTools,
        ...visionTools,
        ...devTools
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
    const { name, arguments: args } = request.params;
    const handlers = [
      handleNutritionTool,
      handleExerciseTool,
      handleBiometricTool,
      handleCoachTool,
      handleProactiveTool,
      handleVisionTool,
      handleDevTool
    ];

    for (const handler of handlers) {
      const res = await handler(name, args);
      if (res) return res;
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

const app = express();
app.use(cors());

// Map to store active SSE transports by their session ID
const transports = new Map<string, SSEServerTransport>();

/**
 * Optimized SSE Connection Handler
 */
const handleSseConnection = async (req: express.Request, res: express.Response) => {
  console.log(`[MCP] New SSE connection: ${req.method} ${req.path}`);
  
  const transport = new SSEServerTransport(req.path, res);
  const server = createMCPServer();
  
  await server.connect(transport);
  
  if (transport.sessionId) {
    transports.set(transport.sessionId, transport);
    console.log(`[MCP] Session active: ${transport.sessionId}`);
    
    res.on("close", () => {
      console.log(`[MCP] Session closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId!);
      server.close();
    });
  }
};

/**
 * Resilient Message Handler
 */
const handleSseMessage = async (req: express.Request, res: express.Response) => {
  const sessionId = req.query.sessionId as string;
  
  let transport = transports.get(sessionId);
  if (!transport) {
    console.log(`[MCP] Session ${sessionId} not found yet, retrying...`);
    await new Promise(r => setTimeout(r, 200));
    transport = transports.get(sessionId);
  }

  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    const activeSessions = Array.from(transports.keys()).join(", ");
    console.error(`[MCP] ERROR: Unknown session ${sessionId}. Active: [${activeSessions}]`);
    res.status(404).send("Unknown session");
  }
};

app.get("/mcp", handleSseConnection);
app.post("/mcp", handleSseMessage);
app.get("/sse", handleSseConnection);
app.post(["/sse", "/messages"], handleSseMessage);

app.use(express.json());

const PORT = process.env.SPARKY_FITNESS_MCP_PORT || process.env.PORT || 5435;

if (process.stdout.isTTY || process.env.TRANSPORT === 'sse') {
    app.listen(PORT, () => {
        console.log(`Sparky MCP Server running on port ${PORT} (SSE mode)`);
    });
} else {
    const server = createMCPServer();
    const transport = new StdioServerTransport();
    server.connect(transport).catch(console.error);
    console.error("Sparky MCP Server running in Stdio mode");
}
