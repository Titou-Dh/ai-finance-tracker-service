import { Elysia } from "elysia";
import type { Cookie } from "elysia";
import { AuthService } from "../modules/auth/auth.service";
import { CookieManager } from "../utils/cookie-manager";
import logger from "../utils/logger";

/**
 * Authentication plugin that provides user authentication functionality
 * Following the pattern from the production example
 */
export const authPlugin = new Elysia({ name: "auth" })
  .decorate("getUser", async (cookie: Record<string, Cookie<any>>) => {
    const token = cookie.access_token?.value;

    if (!token) {
      logger.debug("No access token found in cookies");
      return null;
    }

    try {
      const { user, error } = await AuthService.verifyToken(token);

      if (error || !user) {
        logger.debug({
          error: error?.message,
          operation: "tokenVerification"
        }, "Token verification failed");
        return null;
      }

      logger.debug({
        userId: user.id,
        operation: "tokenVerification"
      }, "User authenticated successfully");
      return {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name,
        created_at: user.created_at,
      };
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : "Unknown error",
        operation: "tokenVerification"
      }, "Error verifying token");
      return null;
    }
  })
  .derive(async ({ getUser, cookie }) => {
    const user = await getUser(cookie);
    return { authUser: user };
  });
