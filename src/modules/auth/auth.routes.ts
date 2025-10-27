import { Elysia, t } from "elysia";
import { AuthService } from "./auth.service";
import { CookieManager } from "../../utils/cookie-manager";
import logger from "../../utils/logger";
import { authPlugin } from "../../plugins/auth.plugin";
import {
  secureCookieSettings,
  refreshCookieSettings,
  authStatusCookieSettings,
} from "../../config/cookie.config";
import type {
  SignUpRequest,
  SignInRequest,
  ResetPasswordRequest,
  UpdatePasswordRequest,
  AuthResponse,
  ApiError,
} from "../../types";

// Validation schemas
const signUpSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 6 }),
  fullName: t.Optional(t.String()),
});

const signInSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String(),
});

const resetPasswordSchema = t.Object({
  email: t.String({ format: "email" }),
});

const updatePasswordSchema = t.Object({
  token: t.String(),
  newPassword: t.String({ minLength: 6 }),
});

// Helper function to create consistent API responses
function createResponse(
  success: boolean,
  message: string,
  data?: any,
  error?: string
) {
  return {
    success,
    message,
    data,
    error,
  };
}

// Helper function to create error response
function createErrorResponse(message: string, data?: any): ApiError {
  return {
    success: false,
    message,
    error: data?.error,
    code: data?.code,
  };
}

export const authRoutes = new Elysia({
  prefix: "/auth",
  tags: ["Authentication"],
})
  .use(authPlugin)
  .post(
    "/register",
    async ({ body, set, request, cookie }) => {
      const requestId = crypto.randomUUID();
      const registrationData = body as SignUpRequest;

      logger.info(
        {
          requestId,
          operation: "register",
          email: registrationData.email,
          hasFullName: !!registrationData.fullName,
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Registration request received"
      );

      try {
        const { user, session, error } = await AuthService.register(
          registrationData
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "register",
              email: registrationData.email,
              error: error.message,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Registration failed"
          );

          set.status = 400;
          return createResponse(false, "Registration failed", {
            error: error.message,
          });
        }

        if (!user) {
          logger.warn(
            {
              requestId,
              operation: "register",
              email: registrationData.email,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Registration failed - no user created"
          );

          set.status = 400;
          return createResponse(false, "Registration failed - no user created");
        }

        logger.info(
          {
            requestId,
            operation: "register",
            userId: user.id,
            email: registrationData.email,
            status: 201,
            hasSession: !!session,
            timestamp: new Date().toISOString(),
          },
          "Registration successful"
        );

        set.status = 201;

        if (session) {
          // Supabase expires_at is in seconds, not milliseconds
          const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
          const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);

          logger.debug(
            {
              requestId,
              operation: "register",
              expiresIn,
              cookieSettings: {
                secure: secureCookieSettings,
                refresh: refreshCookieSettings,
                authStatus: authStatusCookieSettings,
              },
              timestamp: new Date().toISOString(),
            },
            "Setting authentication cookies"
          );

          cookie.access_token.set({
            value: session.access_token,
            ...secureCookieSettings,
            maxAge: expiresIn,
          });

          cookie.refresh_token.set({
            value: session.refresh_token,
            ...refreshCookieSettings,
          });

          cookie.auth_status.set({
            value: "authenticated",
            ...authStatusCookieSettings,
            maxAge: expiresIn,
          });

          logger.debug(
            {
              requestId,
              operation: "register",
              cookiesSet: {
                access_token: !!cookie.access_token.value,
                refresh_token: !!cookie.refresh_token.value,
                auth_status: !!cookie.auth_status.value,
              },
              timestamp: new Date().toISOString(),
            },
            "Cookies set successfully"
          );
        }

        return createResponse(true, "User registered successfully", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
          session: undefined,
        });
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "register",
            email: registrationData.email,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Registration error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: signUpSchema,
      detail: {
        summary: "Register user",
        description: "Register a new user with email and password",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/login",
    async ({ body, set, request, cookie }) => {
      const requestId = crypto.randomUUID();
      const loginData = body as SignInRequest;

      logger.info(
        {
          requestId,
          operation: "login",
          email: loginData.email,
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Login request received"
      );

      try {
        const { user, session, error } = await AuthService.login(loginData);

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "login",
              email: loginData.email,
              error: error.message,
              status: 401,
              timestamp: new Date().toISOString(),
            },
            "Login failed"
          );

          set.status = 401;
          return createResponse(false, "Login failed", {
            error: error.message,
          });
        }

        if (!user || !session) {
          logger.warn(
            {
              requestId,
              operation: "login",
              email: loginData.email,
              status: 401,
              timestamp: new Date().toISOString(),
            },
            "Login failed - invalid credentials"
          );

          set.status = 401;
          return createResponse(false, "Login failed - invalid credentials");
        }

        logger.info(
          {
            requestId,
            operation: "login",
            userId: user.id,
            email: loginData.email,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Login successful"
        );

        set.status = 200;

        // Set cookies using proper .set() method with configuration
        // Supabase expires_at is in seconds, not milliseconds
        const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
        const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);

        logger.debug(
          {
            requestId,
            operation: "login",
            expiresIn,
            expiresAt: new Date(expiresAt).toISOString(),
            sessionExpiresAt: session.expires_at,
            cookieSettings: {
              secure: secureCookieSettings,
              refresh: refreshCookieSettings,
              authStatus: authStatusCookieSettings,
            },
            timestamp: new Date().toISOString(),
          },
          "Setting authentication cookies"
        );

        cookie.access_token.set({
          value: session.access_token,
          ...secureCookieSettings,
          maxAge: expiresIn,
        });

        cookie.refresh_token.set({
          value: session.refresh_token,
          ...refreshCookieSettings,
        });

        cookie.auth_status.set({
          value: "authenticated",
          ...authStatusCookieSettings,
          maxAge: expiresIn,
        });

        logger.debug(
          {
            requestId,
            operation: "login",
            cookiesSet: {
              access_token: !!cookie.access_token.value,
              refresh_token: !!cookie.refresh_token.value,
              auth_status: !!cookie.auth_status.value,
            },
            timestamp: new Date().toISOString(),
          },
          "Cookies set successfully"
        );

        return createResponse(true, "Login successful", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
          session: undefined,
        });
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "login",
            email: loginData.email,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Login error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: signInSchema,
      detail: {
        summary: "Login user",
        description: "Authenticate user with email and password",
        tags: ["Authentication"],
      },
    }
  )

  .get(
    "/me",
    async ({ getUser, cookie, set, request }) => {
      const requestId = crypto.randomUUID();

      logger.info(
        {
          requestId,
          operation: "me",
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Get current user request received"
      );

      // Debug: Log cookie header
      const cookieHeader = request.headers.get("cookie");
      logger.debug(
        {
          requestId,
          operation: "me",
          cookieHeader: cookieHeader || "No cookie header",
          timestamp: new Date().toISOString(),
        },
        "Cookie header received"
      );

      const authUser = await getUser(cookie);

      if (!authUser) {
        logger.warn(
          {
            requestId,
            operation: "me",
            status: 401,
            timestamp: new Date().toISOString(),
          },
          "No authenticated user found"
        );

        set.status = 401;
        return createResponse(false, "Authentication required");
      }

      logger.info(
        {
          requestId,
          operation: "me",
          userId: authUser.id,
          status: 200,
          timestamp: new Date().toISOString(),
        },
        "User info retrieved successfully"
      );

      set.status = 200;
      return createResponse(true, "User info retrieved successfully", {
        user: authUser,
      });
    },
    {
      detail: {
        summary: "Get current user",
        description: "Get current authenticated user information",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/reset-password",
    async ({ body, set, request }) => {
      const requestId = crypto.randomUUID();
      const resetData = body as ResetPasswordRequest;

      logger.info(
        {
          requestId,
          operation: "resetPassword",
          email: resetData.email,
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Password reset request received"
      );

      try {
        const { error } = await AuthService.resetPassword({
          email: resetData.email,
        });

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "resetPassword",
              email: resetData.email,
              error: error.message,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Password reset failed"
          );

          set.status = 400;
          return createResponse(false, "Password reset failed", {
            error: error.message,
          });
        }

        logger.info(
          {
            requestId,
            operation: "resetPassword",
            email: resetData.email,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Password reset email sent successfully"
        );

        set.status = 200;
        return createResponse(true, "Password reset email sent successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "resetPassword",
            email: resetData.email,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Password reset error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: resetPasswordSchema,
      detail: {
        summary: "Reset password",
        description: "Send password reset email to user",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/update-password",
    async ({ body, set, request }) => {
      const requestId = crypto.randomUUID();
      const updateData = body as UpdatePasswordRequest;

      logger.info(
        {
          requestId,
          operation: "updatePassword",
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Password update request received"
      );

      try {
        const { error } = await AuthService.updatePassword(
          updateData.newPassword
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "updatePassword",
              error: error.message,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Password update failed"
          );

          set.status = 400;
          return createResponse(false, "Password update failed", {
            error: error.message,
          });
        }

        logger.info(
          {
            requestId,
            operation: "updatePassword",
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Password updated successfully"
        );

        set.status = 200;
        return createResponse(true, "Password updated successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "updatePassword",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Password update error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: updatePasswordSchema,
      detail: {
        summary: "Update password",
        description: "Update user password using reset token",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/delete-account",
    async ({ getUser, cookie, set, request }) => {
      const requestId = crypto.randomUUID();

      logger.info(
        {
          requestId,
          operation: "deleteAccount",
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Account deletion request received"
      );

      try {
        const user = await getUser(cookie);

        if (!user) {
          logger.warn(
            {
              requestId,
              operation: "deleteAccount",
              status: 401,
              timestamp: new Date().toISOString(),
            },
            "No authenticated user found for account deletion"
          );

          set.status = 401;
          return createResponse(false, "Authentication required");
        }

        const { error } = await AuthService.deleteAccount(user.id);

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "deleteAccount",
              userId: user.id,
              email: user.email,
              error: error.message,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Account deletion failed"
          );

          set.status = 400;
          return createResponse(false, "Account deletion failed", {
            error: error.message,
          });
        }

        // Clear authentication cookies after successful deletion
        cookie.access_token.remove();
        cookie.refresh_token.remove();
        cookie.auth_status.remove();

        logger.info(
          {
            requestId,
            operation: "deleteAccount",
            userId: user.id,
            email: user.email,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Account deleted successfully"
        );

        set.status = 200;
        return createResponse(true, "Account deleted successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "deleteAccount",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Account deletion error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      detail: {
        summary: "Delete account",
        description: "Delete user account permanently",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/logout",
    async ({ getUser, cookie, set, request }) => {
      const requestId = crypto.randomUUID();

      logger.info(
        {
          requestId,
          operation: "logout",
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Logout request received"
      );

      try {
        const user = await getUser(cookie);

        if (user) {
          await AuthService.logout();
        }

        // Clear authentication cookies
        cookie.access_token.remove();
        cookie.refresh_token.remove();
        cookie.auth_status.remove();

        logger.info(
          {
            requestId,
            operation: "logout",
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Logout successful"
        );

        set.status = 200;
        return createResponse(true, "Logged out successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "logout",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Logout error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      detail: {
        summary: "Logout user",
        description: "Logout user and clear session",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/refresh",
    async ({ getUser, cookie, set, request }) => {
      const requestId = crypto.randomUUID();

      logger.info(
        {
          requestId,
          operation: "refresh",
          ip:
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "unknown",
          userAgent: request.headers.get("user-agent") || "unknown",
          timestamp: new Date().toISOString(),
        },
        "Token refresh request received"
      );

      try {
        const refreshToken = CookieManager.extractRefreshToken(
          request.headers.get("cookie") || undefined
        );

        if (!refreshToken) {
          logger.warn(
            {
              requestId,
              operation: "refresh",
              status: 401,
              timestamp: new Date().toISOString(),
            },
            "No refresh token found"
          );

          set.status = 401;
          return createResponse(false, "No refresh token found");
        }

        const { session, error } = await AuthService.refreshSession(
          refreshToken
        );

        if (error || !session) {
          logger.warn(
            {
              requestId,
              operation: "refresh",
              error: error?.message,
              status: 401,
              timestamp: new Date().toISOString(),
            },
            "Token refresh failed"
          );

          set.status = 401;
          return createResponse(false, "Invalid refresh token");
        }

        // Set new cookies using proper .set() method with configuration
        // Supabase expires_at is in seconds, not milliseconds
        const expiresAt = session.expires_at ? session.expires_at * 1000 : Date.now() + 3600000;
        const expiresIn = Math.floor((expiresAt - Date.now()) / 1000);

        cookie.access_token.set({
          value: session.access_token,
          ...secureCookieSettings,
          maxAge: expiresIn,
        });

        cookie.refresh_token.set({
          value: session.refresh_token,
          ...refreshCookieSettings,
        });

        cookie.auth_status.set({
          value: "authenticated",
          ...authStatusCookieSettings,
          maxAge: expiresIn,
        });

        logger.info(
          {
            requestId,
            operation: "refresh",
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Token refreshed successfully"
        );

        set.status = 200;
        return createResponse(true, "Token refreshed successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "refresh",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Token refresh error"
        );

        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      detail: {
        summary: "Refresh token",
        description: "Refresh access token using refresh token",
        tags: ["Authentication"],
      },
    }
  );
