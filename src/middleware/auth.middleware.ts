import { Elysia } from "elysia";
import { AuthService } from "../modules/auth/auth.service";
import { CookieManager } from "../utils/cookie-manager";
import logger from "../utils/logger";

/**
 * Authentication middleware for protecting routes
 * Extracts and validates JWT token from cookies
 */
export const authMiddleware = new Elysia({ name: "auth-middleware" }).derive(
  { as: "scoped" },
  async ({ headers, set, request }) => {
    const requestId = crypto.randomUUID();
    const cookieHeader = headers.cookie;
    const method = request.method;
    const url = request.url;

    logger.debug(
      {
        requestId,
        operation: "authMiddleware",
        method,
        url,
        hasCookies: !!cookieHeader,
        timestamp: new Date().toISOString(),
      },
      "Processing authentication middleware"
    );

    // First try to get access token from cookies
    let token = CookieManager.extractAccessToken(cookieHeader);
    
    if (!token) {
      logger.warn(
        {
          requestId,
          operation: "authMiddleware",
          method,
          url,
          timestamp: new Date().toISOString(),
        },
        "No access token found in cookies"
      );

      set.status = 401;
      throw new Error("Authentication required");
    }

    const tokenPrefix = token.substring(0, 10) + "...";
    
    logger.debug({
      requestId,
      operation: "authMiddleware",
      method,
      url,
      tokenPrefix,
      timestamp: new Date().toISOString(),
    }, "Verifying access token");

    const { user, error } = await AuthService.verifyToken(token);

    if (error || !user) {
      logger.warn(
        {
          requestId,
          operation: "authMiddleware",
          method,
          url,
          tokenPrefix,
          error: error?.message,
          timestamp: new Date().toISOString(),
        },
        "Access token validation failed"
      );

      set.status = 401;
      throw new Error("Invalid or expired token");
    }

    logger.debug(
      {
        requestId,
        operation: "authMiddleware",
        method,
        url,
        userId: user.id,
        tokenPrefix,
        timestamp: new Date().toISOString(),
      },
      "Authentication successful"
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
        created_at: user.created_at,
      },
    };
  }
);

/**
 * Optional authentication middleware
 * Similar to authMiddleware but doesn't throw errors if no token is provided
 * Useful for routes that work with or without authentication
 */
export const optionalAuthMiddleware = new Elysia({
  name: "optional-auth-middleware",
}).derive({ as: "scoped" }, async ({ headers, request }) => {
  const requestId = crypto.randomUUID();
  const cookieHeader = headers.cookie;
  const method = request.method;
  const url = request.url;

  logger.debug(
    {
      requestId,
      operation: "optionalAuthMiddleware",
      method,
      url,
      hasCookies: !!cookieHeader,
      timestamp: new Date().toISOString(),
    },
    "Processing optional authentication middleware"
  );

  // Try to get access token from cookies
  const token = CookieManager.extractAccessToken(cookieHeader);
  
  if (!token) {
    logger.debug(
      {
        requestId,
        operation: "optionalAuthMiddleware",
        method,
        url,
        timestamp: new Date().toISOString(),
      },
      "No access token found in cookies, proceeding without auth"
    );

    return { user: null };
  }

  const tokenPrefix = token.substring(0, 10) + "...";
  const { user, error } = await AuthService.verifyToken(token);

  if (error || !user) {
    logger.debug(
      {
        requestId,
        operation: "optionalAuthMiddleware",
        method,
        url,
        tokenPrefix,
        error: error?.message,
        timestamp: new Date().toISOString(),
      },
      "Token validation failed, proceeding without auth"
    );

    return { user: null };
  }

  logger.debug(
    {
      requestId,
      operation: "optionalAuthMiddleware",
      method,
      url,
      userId: user.id,
      tokenPrefix,
      timestamp: new Date().toISOString(),
    },
    "Optional authentication successful"
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name,
      created_at: user.created_at,
    },
  };
});
