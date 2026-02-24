import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 1. Initialize environment variables. Look for .env in the root (2 levels up from src)
const rootEnvPath = path.resolve(__dirname, "../../.env");
dotenv.config({ path: rootEnvPath });
console.error(`[MCP] Loading env from: ${rootEnvPath}`);

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { nutritionTools, handleNutritionTool } from "./tools/nutrition.js";
import { fitnessTools, handleFitnessTool } from "./tools/fitness.js";
import { biometricTools, handleBiometricTool } from "./tools/biometrics.js";
import { coachTools, handleCoachTool } from "./tools/coach.js";
import { proactiveTools, handleProactiveTool } from "./tools/engagement.js";
import { visionTools, handleVisionTool } from "./tools/vision.js";
import { devTools, handleDevTool } from "./tools/dev.js";
import { MOCK_USER_ID } from "./config.js";

console.error(`[MCP] Active Mock User ID: ${MOCK_USER_ID}`);

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

/**
 * Register Tool Lists
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      ...nutritionTools,
      ...fitnessTools,
      ...biometricTools,
      ...coachTools,
      ...proactiveTools,
      ...visionTools,
      ...devTools
    ],
  };
});

/**
 * Tool Execution Router
 */
server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  // 1. Try Nutrition Tools
  const nutritionRes = await handleNutritionTool(name, args);
  if (nutritionRes) return nutritionRes;

  // 2. Try Fitness Tools
  const fitnessRes = await handleFitnessTool(name, args);
  if (fitnessRes) return fitnessRes;

  // 3. Try Biometric Tools
  const biometricRes = await handleBiometricTool(name, args);
  if (biometricRes) return biometricRes;

  // 4. Try Coach Tools
  const coachRes = await handleCoachTool(name, args);
  if (coachRes) return coachRes;

  // 5. Try Proactive Tools
  const proactiveRes = await handleProactiveTool(name, args);
  if (proactiveRes) return proactiveRes;

  // 6. Try Vision Tools
  const visionRes = await handleVisionTool(name, args);
  if (visionRes) return visionRes;

  // 7. Try Dev Tools
  const devRes = await handleDevTool(name, args);
  if (devRes) return devRes;

  throw new Error(`Unknown tool: ${name}`);
});

/**
 * Transport Setup: SSE
 */
const app = express();
app.use(cors());

let sseTransport: SSEServerTransport | null = null;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection established");
  sseTransport = new SSEServerTransport("/messages", res);
  await server.connect(sseTransport);
});

// IMPORTANT: Do NOT use express.json() before this route. 
// The MCP SDK's handlePostMessage expects to consume the raw request stream.
app.post("/messages", async (req, res) => {
  if (sseTransport) {
    await sseTransport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE transport");
  }
});

// Other routes can use json parsing
app.use(express.json());

const PORT = process.env.SPARKY_FITNESS_MCP_PORT || process.env.PORT || 5435;

if (process.stdout.isTTY || process.env.TRANSPORT === 'sse') {
    app.listen(PORT, () => {
        console.log(`Sparky MCP Server running on port ${PORT} (SSE mode)`);
    });
} else {
    const transport = new StdioServerTransport();
    server.connect(transport).catch(console.error);
    console.error("Sparky MCP Server running in Stdio mode");
}
