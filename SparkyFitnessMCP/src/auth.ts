import { betterAuth } from "better-auth";
import { authPool } from "./db/pool.js";
import { apiKey } from "@better-auth/api-key";

/**
 * MCP Better Auth instance.
 * Shared database with the main server to verify API Keys.
 */
// Auto-construct BETTER_AUTH_URL from project variables if not explicitly set
const authUrl = process.env.BETTER_AUTH_URL || 
  `http://${process.env.SPARKY_FITNESS_SERVER_HOST || "localhost"}:${process.env.SPARKY_FITNESS_SERVER_PORT || "3010"}`;

export const auth = betterAuth({
  database: authPool,
  baseURL: authUrl,
  // @ts-ignore
  secret: Buffer.from(process.env.BETTER_AUTH_SECRET || "", "base64"),
  plugins: [
    apiKey({
      enableSessionForAPIKeys: true,
      schema: {
        apikey: {
          modelName: 'api_key',
          fields: {
            // @ts-ignore
            id: 'id',
            name: 'name',
            key: 'key',
            referenceId: 'reference_id',
            configId: 'config_id',
            token: 'key',
            metadata: 'metadata',
            createdAt: 'created_at',
            updatedAt: 'updated_at',
            expiresAt: 'expires_at',
            start: 'start',
            prefix: 'prefix',
            refillInterval: 'refill_interval',
            refillAmount: 'refill_amount',
            lastRefillAt: 'last_refill_at',
            enabled: 'enabled',
            rateLimitEnabled: 'rate_limit_enabled',
            rateLimitTimeWindow: 'rate_limit_time_window',
            rateLimitMax: 'rate_limit_max',
            requestCount: 'request_count',
            remaining: 'remaining',
            lastRequest: 'last_request',
            permissions: 'permissions',
          },
        },
      },
    }),
  ],
  advanced: {
    cookiePrefix: "sparky",
  },
  user: {
    fields: {
      // @ts-ignore
      id: "id",
      emailVerified: "email_verified",
    },
  },
  session: {
    fields: {
      // @ts-ignore
      id: "id",
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
});
