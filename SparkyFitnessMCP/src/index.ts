import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables immediately before other imports
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateToken } from "./auth/middleware.js";
import { auth } from "./auth.js";
import { registerAllTools } from "./tools/register.js";
import pool from "./db/pool.js";
import { GRACEFUL_SHUTDOWN_TIMEOUT_MS } from "./constants.js";

const app = express();
const PORT = parseInt(process.env.SPARKY_FITNESS_MCP_PORT || process.env.PORT || "3001", 10);
const TRANSPORT = process.env.MCP_TRANSPORT || "http";

// ─── Security Middleware ─────────────────────────────────────────────────────
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: "*", credentials: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/health", async (_req, res) => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "unhealthy", timestamp: new Date().toISOString() });
  }
});

// ─── MCP HTTP Endpoint (authenticated) ───────────────────────────────────────
app.post("/mcp", authenticateToken, async (req, res) => {
  const userId = req.userId!;
  try {
    const mcpServer = new McpServer({ name: "sparkyfitness-mcp-server", version: "1.0.0" });
    registerAllTools(mcpServer, userId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("[MCP] HTTP error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Start MCP Stdio Mode (for AI clients) ────────────────────────────────────
async function startStdio() {
  // In stdio mode, we expect the API Key to be provided via environment variables
  const apiKey = process.env.SPARKY_FITNESS_API_KEY || process.env.Authorization?.replace("Bearer ", "");
  
  if (!apiKey) {
    console.error("[MCP] Authentication Error: No API Key provided in environment.");
    process.exit(1);
  }

  // Resolve user from API Key using Better Auth
  const session = await auth.api.getSession({
    headers: new Headers({ "x-api-key": apiKey })
  });

  if (!session || !session.user) {
    console.error("[MCP] Authentication Error: Invalid API Key.");
    process.exit(1);
  }

  const userId = session.user.id;
  console.error(`[MCP] Authenticated as ${session.user.email} (Stdio mode)`);
  
  const mcpServer = new McpServer({ name: "sparkyfitness-mcp-server", version: "1.0.0" });
  registerAllTools(mcpServer, userId);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

// ─── Start Server ────────────────────────────────────────────────────────────
async function start() {
  if (TRANSPORT === "stdio") {
    await startStdio();
    return;
  }

  const server = app.listen(PORT, () => {
    console.log(`[MCP] SparkyFitness MCP Server running on port ${PORT} (HTTP)`);
    console.log(`[MCP] Environment: ${process.env.NODE_ENV || "development"}`);
  });

  function gracefulShutdown(signal: string) {
    console.log(`[MCP] ${signal} received, shutting down...`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), GRACEFUL_SHUTDOWN_TIMEOUT_MS);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

start().catch(err => {
  console.error("[MCP] Startup error:", err);
  process.exit(1);
});
