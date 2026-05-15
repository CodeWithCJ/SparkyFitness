import pg from "pg";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { DB_POOL_MAX, DB_IDLE_TIMEOUT_MS, DB_CONNECTION_TIMEOUT_MS } from "../constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure environment variables are loaded BEFORE the pool is initialized
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const { Pool } = pg;

// --- Owner Pool (For Better Auth / System tasks - Bypasses RLS) ---
const authPoolConfig = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: parseInt(process.env.SPARKY_FITNESS_DB_PORT || "5432", 10),
  database: process.env.SPARKY_FITNESS_DB_NAME,
  user: process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_DB_PASSWORD,
};

// --- App Pool (For User Data - Subject to RLS) ---
const appPoolConfig = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: parseInt(process.env.SPARKY_FITNESS_DB_PORT || "5432", 10),
  database: process.env.SPARKY_FITNESS_DB_NAME,
  user: process.env.SPARKY_FITNESS_APP_DB_USER || process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD || process.env.SPARKY_FITNESS_DB_PASSWORD,
};

const authPool = new Pool({
  ...authPoolConfig,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
});

const appPool = new Pool({
  ...appPoolConfig,
  max: DB_POOL_MAX,
  idleTimeoutMillis: DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: DB_CONNECTION_TIMEOUT_MS,
});

export { authPool, appPool };
export default appPool;
