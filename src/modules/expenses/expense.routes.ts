import { Elysia, t } from "elysia";
import { ExpenseService } from "./expense.service";
import { authPlugin } from "../../plugins/auth.plugin";
import { cachePlugin } from "../../plugins/cache.plugin";
import { rateLimitPlugin, RATE_LIMITS } from "../../plugins/rate-limit.plugin";
import logger from "../../utils/logger";
import type {
  CreateExpenseRequest,
  UpdateExpenseRequest,
} from "../../db/types";

// Validation schemas
const createExpenseSchema = t.Object({
  amount: t.Number({ minimum: 0.01 }),
  description: t.Optional(t.String()),
  categoryId: t.Number({ minimum: 1 }),
  expenseDate: t.Optional(t.String({ format: "date-time" })),
});

const updateExpenseSchema = t.Object({
  amount: t.Optional(t.Number({ minimum: 0.01 })),
  description: t.Optional(t.String()),
  categoryId: t.Optional(t.Number({ minimum: 1 })),
  expenseDate: t.Optional(t.String({ format: "date-time" })),
});

const expenseParamsSchema = t.Object({
  id: t.String(),
});

const expenseQuerySchema = t.Object({
  page: t.Optional(t.String()),
  limit: t.Optional(t.String()),
});

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

export const expenseRoutes = new Elysia({
  prefix: "/expenses",
  tags: ["Expenses"],
})
  .use(authPlugin)
  .use(cachePlugin)
  .use(rateLimitPlugin)
  .derive(async ({ getUser, cookie }) => {
    const user = await getUser(cookie);
    if (!user) {
      throw new Error("Authentication required");
    }
    return { user };
  })
  .post(
    "/",
    async ({ body, user, set, cacheInvalidator }) => {
      const requestId = crypto.randomUUID();
      const expenseData = body as CreateExpenseRequest;

      logger.info(
        {
          requestId,
          operation: "createExpense",
          userId: user.id,
          amount: expenseData.amount,
          categoryId: expenseData.categoryId,
          timestamp: new Date().toISOString(),
        },
        "Creating new expense"
      );

      try {
        const { expense, error } = await ExpenseService.createExpense(
          user.id,
          expenseData
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "createExpense",
              userId: user.id,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Expense creation failed"
          );

          set.status = 400;
          return createResponse(false, "Failed to create expense", null, error || "Unknown error");
        }

        // Invalidate user expenses cache
        await cacheInvalidator.invalidateUserExpenses(user.id);

        logger.info(
          {
            requestId,
            operation: "createExpense",
            userId: user.id,
            expenseId: expense?.id,
            status: 201,
            timestamp: new Date().toISOString(),
          },
          "Expense created successfully"
        );

        set.status = 201;
        return createResponse(true, "Expense created successfully", expense);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "createExpense",
            userId: user.id,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Expense creation error"
        );

        set.status = 500;
        return createResponse(
          false,
          "Internal server error",
          null,
          "Unknown error"
        );
      }
    },
    {
      body: createExpenseSchema,
      detail: {
        summary: "Create expense",
        description: "Create a new expense",
        tags: ["Expenses"],
      },
    }
  )
  .get(
    "/",
    async ({ query, user, set, cache, CACHE_KEYS, CACHE_TTL }) => {
      const requestId = crypto.randomUUID();
      const page = parseInt(query.page || "1");
      const limit = parseInt(query.limit || "20");

      logger.info(
        {
          requestId,
          operation: "getExpenses",
          userId: user.id,
          page,
          limit,
          timestamp: new Date().toISOString(),
        },
        "Getting expenses list"
      );

      try {
        // Try to get from cache first
        const cacheKey = CACHE_KEYS.USER_EXPENSES(user.id, page, limit);
        const cached = await cache.get(cacheKey);
        
        if (cached) {
          logger.debug({ requestId, cacheKey }, "Cache hit for expenses");
          set.status = 200;
          return createResponse(true, "Expenses retrieved successfully", cached);
        }

        logger.debug({ requestId, cacheKey }, "Cache miss for expenses");
        const { data, error } = await ExpenseService.getExpenses(
          user.id,
          page,
          limit
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "getExpenses",
              userId: user.id,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Failed to get expenses"
          );

          set.status = 400;
          return createResponse(false, "Failed to get expenses", null, error || "Unknown error");
        }

        // Cache the result
        if (data) {
          await cache.set(cacheKey, data, CACHE_TTL.SHORT);
        }

        logger.info(
          {
            requestId,
            operation: "getExpenses",
            userId: user.id,
            page,
            limit,
            total: data?.pagination.total,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Expenses retrieved successfully"
        );

        set.status = 200;
        return createResponse(true, "Expenses retrieved successfully", data);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "getExpenses",
            userId: user.id,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error getting expenses"
        );

        set.status = 500;
        return createResponse(
          false,
          "Internal server error",
          null,
          "Unknown error"
        );
      }
    },
    {
      query: expenseQuerySchema,
      detail: {
        summary: "Get expenses",
        description: "Get paginated list of expenses",
        tags: ["Expenses"],
      },
    }
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const requestId = crypto.randomUUID();
      const expenseId = parseInt(params.id);

      logger.info(
        {
          requestId,
          operation: "getExpenseById",
          userId: user.id,
          expenseId,
          timestamp: new Date().toISOString(),
        },
        "Getting expense by ID"
      );

      try {
        const { expense, error } = await ExpenseService.getExpenseById(
          expenseId,
          user.id
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "getExpenseById",
              userId: user.id,
              expenseId,
              error,
              status: 404,
              timestamp: new Date().toISOString(),
            },
            "Expense not found"
          );

          set.status = 404;
          return createResponse(false, "Expense not found", null, error || "Unknown error");
        }

        logger.info(
          {
            requestId,
            operation: "getExpenseById",
            userId: user.id,
            expenseId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Expense retrieved successfully"
        );

        set.status = 200;
        return createResponse(true, "Expense retrieved successfully", expense);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "getExpenseById",
            userId: user.id,
            expenseId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error getting expense"
        );

        set.status = 500;
        return createResponse(
          false,
          "Internal server error",
          null,
          "Unknown error"
        );
      }
    },
    {
      params: expenseParamsSchema,
      detail: {
        summary: "Get expense by ID",
        description: "Get a specific expense by ID",
        tags: ["Expenses"],
      },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      const requestId = crypto.randomUUID();
      const expenseId = parseInt(params.id);
      const updateData = body as UpdateExpenseRequest;

      logger.info(
        {
          requestId,
          operation: "updateExpense",
          userId: user.id,
          expenseId,
          updateData,
          timestamp: new Date().toISOString(),
        },
        "Updating expense"
      );

      try {
        const { expense, error } = await ExpenseService.updateExpense(
          expenseId,
          user.id,
          updateData
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "updateExpense",
              userId: user.id,
              expenseId,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Expense update failed"
          );

          set.status = 400;
          return createResponse(false, "Failed to update expense", null, error || "Unknown error");
        }

        logger.info(
          {
            requestId,
            operation: "updateExpense",
            userId: user.id,
            expenseId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Expense updated successfully"
        );

        set.status = 200;
        return createResponse(true, "Expense updated successfully", expense);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "updateExpense",
            userId: user.id,
            expenseId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error updating expense"
        );

        set.status = 500;
        return createResponse(
          false,
          "Internal server error",
          null,
          "Unknown error"
        );
      }
    },
    {
      params: expenseParamsSchema,
      body: updateExpenseSchema,
      detail: {
        summary: "Update expense",
        description: "Update an existing expense",
        tags: ["Expenses"],
      },
    }
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const requestId = crypto.randomUUID();
      const expenseId = parseInt(params.id);

      logger.info(
        {
          requestId,
          operation: "deleteExpense",
          userId: user.id,
          expenseId,
          timestamp: new Date().toISOString(),
        },
        "Deleting expense"
      );

      try {
        const { success, error } = await ExpenseService.deleteExpense(
          expenseId,
          user.id
        );

        if (!success) {
          logger.warn(
            {
              requestId,
              operation: "deleteExpense",
              userId: user.id,
              expenseId,
              error,
              status: 404,
              timestamp: new Date().toISOString(),
            },
            "Expense deletion failed"
          );

          set.status = 404;
          return createResponse(false, "Failed to delete expense", null, error || "Unknown error");
        }

        logger.info(
          {
            requestId,
            operation: "deleteExpense",
            userId: user.id,
            expenseId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Expense deleted successfully"
        );

        set.status = 200;
        return createResponse(true, "Expense deleted successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "deleteExpense",
            userId: user.id,
            expenseId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error deleting expense"
        );

        set.status = 500;
        return createResponse(
          false,
          "Internal server error",
          null,
          "Unknown error"
        );
      }
    },
    {
      params: expenseParamsSchema,
      detail: {
        summary: "Delete expense",
        description: "Delete an expense",
        tags: ["Expenses"],
      },
    }
  );
