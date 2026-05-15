import type { Request, Response, NextFunction } from "express";
import { auth } from "../auth.js";
import { serializeSignedCookie } from "better-call";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: any;
    }
  }
}

/**
 * Authenticates the request using Better Auth.
 * Supports:
 * 1. x-api-key header
 * 2. Bearer <api_key> (automatically mapped to x-api-key)
 * 3. Bearer <session_token> (converted to session cookie)
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // 1. Bearer Token Mapping (Helper for AI clients like Claude)
    if (req.headers.authorization?.startsWith("Bearer ")) {
      const token = req.headers.authorization.split(" ")[1];
      
      // If it looks like an API key (long, no dots), map to x-api-key
      if (token && token.length >= 64 && !token.includes(".")) {
        req.headers["x-api-key"] = token;
      } else if (token) {
        // Otherwise treat as a session token (signed cookie injection)
        const prefix = "sparky"; // Matches server auth.ts prefix
        const cookieName = `${prefix}.session_token`;
        const secretStr = Buffer.isBuffer(auth.options.secret) ? auth.options.secret.toString() : String(auth.options.secret);
        const signed = await serializeSignedCookie("", token, secretStr);
        const signedValue = signed.replace("=", "");
        const cookieHeader = `${cookieName}=${signedValue}`;
        req.headers.cookie = req.headers.cookie ? `${req.headers.cookie}; ${cookieHeader}` : cookieHeader;
      }
    }

    // 2. Resolve identity via Better Auth
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session && session.user) {
      req.userId = session.user.id;
      req.user = session.user;
      return next();
    }

    res.status(401).json({ error: "Authentication required. Provide a valid Better Auth API Key." });
  } catch (error) {
    console.error("[MCP] Auth error:", error);
    res.status(500).json({ error: "Internal authentication error" });
  }
}
