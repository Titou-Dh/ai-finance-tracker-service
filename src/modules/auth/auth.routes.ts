import { Elysia, t } from "elysia";
import { AuthService } from "./auth.service";
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
  fullName: t.Optional(t.String({ minLength: 1 })),
});

const signInSchema = t.Object({
  email: t.String({ format: "email" }),
  password: t.String({ minLength: 1 }),
});

const resetPasswordSchema = t.Object({
  email: t.String({ format: "email" }),
});

const updatePasswordSchema = t.Object({
  newPassword: t.String({ minLength: 6 }),
});

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

function createResponse(
  success: boolean,
  message: string,
  data?: any
): AuthResponse | ApiError {
  if (success) {
    return {
      success: true,
      message,
      ...data,
    };
  }
  return {
    success: false,
    message,
    error: data?.error,
    code: data?.code,
  };
}

export const authRoutes = new Elysia({ prefix: "/auth" })
  .post(
    "/register",
    async ({ body, set }) => {
      try {
        const { user, session, error } = await AuthService.register(
          body as SignUpRequest
        );

        if (error) {
          set.status = 400;
          return createResponse(false, "Registration failed", {
            error: error.message,
          });
        }

        if (!user) {
          set.status = 400;
          return createResponse(false, "Registration failed - no user created");
        }

        set.status = 201;
        return createResponse(true, "User registered successfully", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
          session: session
            ? {
                access_token: session.access_token,
                refresh_token: session.refresh_token,
                expires_at: session.expires_at,
              }
            : undefined,
        });
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: signUpSchema,
      detail: {
        summary: "Register a new user",
        description: "Create a new user account with email and password",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/login",
    async ({ body, set }) => {
      try {
        const { user, session, error } = await AuthService.login(
          body as SignInRequest
        );

        if (error) {
          set.status = 401;
          return createResponse(false, "Login failed", {
            error: error.message,
          });
        }

        if (!user || !session) {
          set.status = 401;
          return createResponse(false, "Login failed - invalid credentials");
        }

        set.status = 200;
        return createResponse(true, "Login successful", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          },
        });
      } catch (error) {
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
    async ({ headers, set }) => {
      try {
        const token = extractToken(headers.authorization);

        if (!token) {
          set.status = 401;
          return createResponse(false, "Authorization token required");
        }

        const { user, error } = await AuthService.verifyToken(token);

        if (error) {
          set.status = 401;
          return createResponse(false, "Invalid token", {
            error: error.message,
          });
        }

        if (!user) {
          set.status = 401;
          return createResponse(false, "User not found");
        }

        set.status = 200;
        return createResponse(true, "User retrieved successfully", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
        });
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      headers: t.Object({
        authorization: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get current user",
        description: "Get information about the currently authenticated user",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/reset-password",
    async ({ body, set }) => {
      try {
        const { error } = await AuthService.resetPassword(
          body as ResetPasswordRequest
        );

        if (error) {
          set.status = 400;
          return createResponse(false, "Password reset failed", {
            error: error.message,
          });
        }

        set.status = 200;
        return createResponse(true, "Password reset email sent successfully");
      } catch (error) {
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

  .put(
    "/update-password",
    async ({ body, headers, set }) => {
      try {
        const token = extractToken(headers.authorization);

        if (!token) {
          set.status = 401;
          return createResponse(false, "Authorization token required");
        }

        const { user, error: userError } = await AuthService.verifyToken(token);

        if (userError || !user) {
          set.status = 401;
          return createResponse(false, "Invalid token");
        }

        const { error } = await AuthService.updatePassword(body.newPassword);

        if (error) {
          set.status = 400;
          return createResponse(false, "Password update failed", {
            error: error.message,
          });
        }

        set.status = 200;
        return createResponse(true, "Password updated successfully");
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: updatePasswordSchema,
      headers: t.Object({
        authorization: t.Optional(t.String()),
      }),
      detail: {
        summary: "Update password",
        description: "Update user password (requires authentication)",
        tags: ["Authentication"],
      },
    }
  )

  .delete(
    "/delete-account",
    async ({ headers, set }) => {
      try {
        const token = extractToken(headers.authorization);

        if (!token) {
          set.status = 401;
          return createResponse(false, "Authorization token required");
        }

        const { user, error: userError } = await AuthService.verifyToken(token);

        if (userError || !user) {
          set.status = 401;
          return createResponse(false, "Invalid token");
        }

        const { error } = await AuthService.deleteAccount(user.id);

        if (error) {
          set.status = 400;
          return createResponse(false, "Account deletion failed", {
            error: error.message,
          });
        }

        set.status = 200;
        return createResponse(true, "Account deleted successfully");
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      headers: t.Object({
        authorization: t.Optional(t.String()),
      }),
      detail: {
        summary: "Delete account",
        description:
          "Permanently delete user account (requires authentication)",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/logout",
    async ({ headers, set }) => {
      try {
        const token = extractToken(headers.authorization);

        if (!token) {
          set.status = 401;
          return createResponse(false, "Authorization token required");
        }

        const { error } = await AuthService.logout();

        if (error) {
          set.status = 400;
          return createResponse(false, "Logout failed", {
            error: error.message,
          });
        }

        set.status = 200;
        return createResponse(true, "Logged out successfully");
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      headers: t.Object({
        authorization: t.Optional(t.String()),
      }),
      detail: {
        summary: "Logout user",
        description: "Logout the current user session",
        tags: ["Authentication"],
      },
    }
  )

  .post(
    "/refresh",
    async ({ body, set }) => {
      try {
        const { refreshToken } = body as { refreshToken: string };

        if (!refreshToken) {
          set.status = 400;
          return createResponse(false, "Refresh token required");
        }

        const { user, session, error } = await AuthService.refreshSession(
          refreshToken
        );

        if (error) {
          set.status = 401;
          return createResponse(false, "Token refresh failed", {
            error: error.message,
          });
        }

        if (!user || !session) {
          set.status = 401;
          return createResponse(false, "Invalid refresh token");
        }

        set.status = 200;
        return createResponse(true, "Token refreshed successfully", {
          user: {
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name,
            created_at: user.created_at,
          },
          session: {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
          },
        });
      } catch (error) {
        set.status = 500;
        return createResponse(false, "Internal server error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    {
      body: t.Object({
        refreshToken: t.String(),
      }),
      detail: {
        summary: "Refresh token",
        description: "Refresh access token using refresh token",
        tags: ["Authentication"],
      },
    }
  );
