import path from "path";
import dotenv from "dotenv";

// Load environment variables immediately
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "..", ".env") });

import express from "express";
import cors from "cors";
import helmet from "helmet";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { serializeSignedCookie } from "better-call";
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
  // Priority 1: API Key (n8n, external tools, or server-wide config)
  // Priority 2: Cookie or Authorization header forwarded from the backend (frontend sessions)
  const authHeaders = new Headers();

  if (process.env.SPARKY_FITNESS_API_KEY) {
    // n8n / external tools path — explicit API key in env
    authHeaders.set("x-api-key", process.env.SPARKY_FITNESS_API_KEY);
  } else if (process.env.Authorization) {
    // Bearer token forwarded from the backend (API key or session token)
    const token = process.env.Authorization.replace("Bearer ", "");
    if (token.length >= 64 && !token.includes(".")) {
      // Looks like a 64-char API key
      authHeaders.set("x-api-key", token);
    } else {
      // Session bearer token — sign it into a cookie like the server middleware does
      const prefix = "sparky";
      const cookieName = `${prefix}.session_token`;
      const secretStr = Buffer.isBuffer(auth.options.secret)
        ? auth.options.secret.toString()
        : String(auth.options.secret);
      const signed = await serializeSignedCookie("", token, secretStr);
      const signedValue = signed.replace("=", "");
      authHeaders.set("cookie", `${cookieName}=${signedValue}`);
    }
  } else if (process.env.Cookie) {
    // Raw cookie string forwarded from the backend (frontend session cookie)
    authHeaders.set("cookie", process.env.Cookie);
  } else {
    console.error(
      "[MCP] Authentication Error: No credentials found in environment. " +
      "Set SPARKY_FITNESS_API_KEY (for n8n/external tools) or ensure the " +
      "backend forwards Authorization/Cookie (for frontend sessions)."
    );
    process.exit(1);
  }

  const session = await auth.api.getSession({ headers: authHeaders });

  if (!session || !session.user) {
    console.error("[MCP] Authentication Error: Credentials are invalid or session has expired.");
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
