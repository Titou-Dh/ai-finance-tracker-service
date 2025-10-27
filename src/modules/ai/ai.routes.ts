import { Elysia, t } from "elysia";
import { AIService } from "./ai.service";
import { authPlugin } from "../../plugins/auth.plugin";
import { cachePlugin } from "../../plugins/cache.plugin";
import { rateLimitPlugin } from "../../plugins/rate-limit.plugin";
import logger from "../../utils/logger";

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

export const aiRoutes = new Elysia({
  prefix: "/ai",
  tags: ["AI Analysis"],
})
  .use(authPlugin)
  .use(cachePlugin)
  .use(rateLimitPlugin)
  .get(
    "/health",
    async ({ set, request }) => {
      const requestId = crypto.randomUUID();
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";

      logger.info(
        {
          requestId,
          operation: "aiHealthCheck",
          ip,
          userAgent,
          timestamp: new Date().toISOString(),
        },
        "AI health check request received"
      );

      try {
        const healthStatus = await AIService.healthCheck();

        logger.info(
          {
            requestId,
            operation: "aiHealthCheck",
            status: healthStatus.status,
            timestamp: new Date().toISOString(),
          },
          "AI health check completed"
        );

        return createResponse(
          true,
          "AI service health check completed",
          healthStatus
        );
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "aiHealthCheck",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
          "AI health check failed"
        );

        set.status = 500;
        return createResponse(
          false,
          "AI service health check failed",
          null,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    },
    {
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Object({
            status: t.String(),
            timestamp: t.String(),
            service: t.String(),
          }),
        }),
        500: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Null(),
          error: t.String(),
        }),
      },
    }
  )
  .get(
    "/analyze",
    async ({
      getUser,
      cookie,
      query,
      set,
      request,
      cache,
      cacheInvalidator,
    }) => {
      const requestId = crypto.randomUUID();
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const monthsBack = query.monthsBack || 3;

      logger.info(
        {
          requestId,
          operation: "analyzeExpenses",
          ip,
          userAgent,
          monthsBack,
          timestamp: new Date().toISOString(),
        },
        "Expense analysis request received"
      );

      try {
        const user = await getUser(cookie);
        if (!user) {
          logger.warn(
            {
              requestId,
              operation: "analyzeExpenses",
              ip,
              userAgent,
              timestamp: new Date().toISOString(),
            },
            "Unauthorized expense analysis request"
          );

          set.status = 401;
          return createResponse(
            false,
            "Authentication required",
            null,
            "No authenticated user found"
          );
        }

        const cacheKey = `ai_analysis_${user.id}_${monthsBack}`;
        const cachedAnalysis = await cache.get(cacheKey);

        if (cachedAnalysis) {
          logger.info(
            {
              requestId,
              operation: "analyzeExpenses",
              userId: user.id,
              monthsBack,
              cached: true,
              timestamp: new Date().toISOString(),
            },
            "Returning cached expense analysis"
          );

          return createResponse(
            true,
            "Expense analysis retrieved from cache",
            typeof cachedAnalysis === "string"
              ? JSON.parse(cachedAnalysis)
              : cachedAnalysis
          );
        }

        const analysis = await AIService.analyzeExpenses(user.id, monthsBack);

        await cache.set(cacheKey, analysis, 3600);

        logger.info(
          {
            requestId,
            operation: "analyzeExpenses",
            userId: user.id,
            monthsBack,
            totalAmount: analysis.totalAmount,
            categoryCount: analysis.categoryBreakdown.length,
            timestamp: new Date().toISOString(),
          },
          "Expense analysis completed successfully"
        );

        return createResponse(true, "Expense analysis completed", analysis);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "analyzeExpenses",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          },
          "Expense analysis failed"
        );

        set.status = 500;
        return createResponse(
          false,
          "Failed to analyze expenses",
          null,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    },
    {
      query: t.Object({
        monthsBack: t.Optional(t.Number({ minimum: 1, maximum: 12 })),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Object({
            totalAmount: t.Number(),
            categoryBreakdown: t.Array(
              t.Object({
                categoryName: t.String(),
                amount: t.Number(),
                percentage: t.Number(),
                count: t.Number(),
              })
            ),
            monthlyTrend: t.Array(
              t.Object({
                month: t.String(),
                amount: t.Number(),
              })
            ),
            insights: t.String(),
          }),
        }),
        401: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Null(),
          error: t.String(),
        }),
        500: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Null(),
          error: t.String(),
        }),
      },
    }
  )
  .get(
    "/suggestions",
    async ({ getUser, cookie, query, set, request, cache }) => {
      const requestId = crypto.randomUUID();
      const userAgent = request.headers.get("user-agent") || "unknown";
      const ip =
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown";
      const monthsBack = query.monthsBack || 3;

      logger.info(
        {
          requestId,
          operation: "getSuggestions",
          ip,
          userAgent,
          monthsBack,
          timestamp: new Date().toISOString(),
        },
        "Expense suggestions request received"
      );

      try {
        const user = await getUser(cookie);
        if (!user) {
          logger.warn(
            {
              requestId,
              operation: "getSuggestions",
              ip,
              userAgent,
              timestamp: new Date().toISOString(),
            },
            "Unauthorized suggestions request"
          );

          set.status = 401;
          return createResponse(
            false,
            "Authentication required",
            null,
            "No authenticated user found"
          );
        }

        const cacheKey = `ai_suggestions_${user.id}_${monthsBack}`;
        const cachedSuggestions = await cache.get(cacheKey);

        if (cachedSuggestions) {
          logger.info(
            {
              requestId,
              operation: "getSuggestions",
              userId: user.id,
              monthsBack,
              cached: true,
              timestamp: new Date().toISOString(),
            },
            "Returning cached suggestions"
          );

          return createResponse(
            true,
            "Suggestions retrieved from cache",
            typeof cachedSuggestions === "string"
              ? JSON.parse(cachedSuggestions)
              : cachedSuggestions
          );
        }

        const suggestions = await AIService.getSuggestions(user.id, monthsBack);

        await cache.set(cacheKey, suggestions, 7200);

        return createResponse(
          true,
          "Expense suggestions generated",
          suggestions
        );
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "getSuggestions",
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          },
          "Expense suggestions generation failed"
        );

        set.status = 500;
        return createResponse(
          false,
          "Failed to generate suggestions",
          null,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    },
    {
      query: t.Object({
        monthsBack: t.Optional(t.Number({ minimum: 1, maximum: 12 })),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Object({
            suggestions: t.Array(t.String()),
            priority: t.Union([
              t.Literal("low"),
              t.Literal("medium"),
              t.Literal("high"),
            ]),
          }),
        }),
        401: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Null(),
          error: t.String(),
        }),
        500: t.Object({
          success: t.Boolean(),
          message: t.String(),
          data: t.Null(),
          error: t.String(),
        }),
      },
    }
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Validation Error", details: error.message };
    }

    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        set.status = 401;
        return { error: "Unauthorized" };
      }
    }

    set.status = 500;
    return { error: "Internal Server Error" };
  });
