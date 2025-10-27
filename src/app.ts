import http from "http";
import { Readable } from "stream";
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import logger from "./utils/logger";
import { authRoutes } from "./modules/auth/auth.routes";
import { expenseRoutes } from "./modules/expenses/expense.routes";
import { categoryRoutes } from "./modules/categories/category.routes";
import { aiRoutes } from "./modules/ai/ai.routes";
import { cachePlugin } from "./plugins/cache.plugin";
import { rateLimitPlugin } from "./plugins/rate-limit.plugin";

/**
 * Build the Elysia application with CORS and Swagger docs.
 */
export function createApp() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;

  const app = new Elysia({ name: "ai-finance-tracker-api" })
    .onRequest(({ request, set }) => {
      const startTime = Date.now();
      const method = request.method;
      const url = request.url;
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";

      logger.info(
        {
          method,
          url,
          userAgent,
          ip,
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
        `Incoming request: ${method} ${url}`
      );

      (request as any).startTime = startTime;
    })

    .onAfterHandle(({ request, set }) => {
      const startTime = (request as any).startTime;
      const duration = startTime ? Date.now() - startTime : 0;
      const method = request.method;
      const url = request.url;
      const status = set.status || 200;

      logger.info(
        {
          method,
          url,
          status,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        },
        `Request completed: ${method} ${url} - ${status} (${duration}ms)`
      );
    })

    .onError(({ error, request, set }) => {
      const method = request.method;
      const url = request.url;
      const status = set.status || 500;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error(
        {
          method,
          url,
          status,
          error: errorMessage,
          stack: errorStack,
          timestamp: new Date().toISOString(),
        },
        `Request error: ${method} ${url} - ${status}: ${errorMessage}`
      );

      return {
        success: false,
        message: "Internal server error",
        error:
          process.env.NODE_ENV === "development"
            ? errorMessage
            : "Something went wrong",
      };
    })

    .use(
      cors({
        origin: (origin) => true,
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: [
          "Content-Type",
          "Authorization",
          "X-Requested-With",
          "Accept",
        ],
      })
    )
    .use(cachePlugin)
    .use(rateLimitPlugin)
    .use(
      swagger({
        path: "/docs",
        documentation: {
          info: {
            title: "AI Finance Tracker API",
            version: "1.0.0",
            description: "API documentation for the AI Finance Tracker",
          },
          tags: [
            { name: "system", description: "System and health endpoints" },
            { name: "AI Analysis", description: "AI-powered expense analysis and suggestions" },
            {
              name: "Authentication",
              description: "User authentication endpoints",
            },
            { name: "Expenses", description: "Expense management endpoints" },
            { name: "Categories", description: "Category management endpoints" },
          ],
        },
      })
    )
    .get("/", () => ({ message: "AI Finance Tracker API" }), {
      detail: { tags: ["system"], summary: "Root" },
    })
    .get("/health", () => ({ status: "ok" }), {
      detail: { tags: ["system"], summary: "Health check" },
    })
    .use(authRoutes)
    .use(expenseRoutes)
    .use(categoryRoutes)
    .use(aiRoutes)
    .listen(process.env.PORT ? Number(process.env.PORT) : 3000);

  return app;
}
