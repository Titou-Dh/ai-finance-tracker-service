import { db } from "../../db/drizzle";
import { expenses, categories } from "../../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import type {
  Expense,
  NewExpense,
  ExpenseWithCategory,
  CreateExpenseRequest,
  UpdateExpenseRequest,
  ExpenseListResponse,
} from "../../db/types";
import logger from "../../utils/logger";

export class ExpenseService {
  /**
   * Create a new expense
   */
  static async createExpense(
    userId: string,
    expenseData: CreateExpenseRequest
  ): Promise<{ expense: ExpenseWithCategory | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "createExpense",
      userId,
      amount: expenseData.amount,
      categoryId: expenseData.categoryId,
      timestamp: new Date().toISOString(),
    }, "Creating new expense");

    try {
      // Verify category belongs to user
      const category = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, expenseData.categoryId),
            eq(categories.userId, userId)
          )
        )
        .limit(1);

      if (category.length === 0) {
        logger.warn({
          requestId,
          operation: "createExpense",
          userId,
          categoryId: expenseData.categoryId,
          timestamp: new Date().toISOString(),
        }, "Category not found or doesn't belong to user");

        return { expense: null, error: "Category not found" };
      }

      // Create expense
      const newExpense: NewExpense = {
        amount: expenseData.amount.toString(),
        description: expenseData.description,
        categoryId: expenseData.categoryId,
        userId,
        expenseDate: expenseData.expenseDate ? new Date(expenseData.expenseDate) : new Date(),
      };

      const [createdExpense] = await db
        .insert(expenses)
        .values(newExpense)
        .returning();

      // Get expense with category
      const expenseWithCategory = await this.getExpenseById(createdExpense.id, userId);

      logger.info({
        requestId,
        operation: "createExpense",
        userId,
        expenseId: createdExpense.id,
        timestamp: new Date().toISOString(),
      }, "Expense created successfully");

      return { expense: expenseWithCategory.expense, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "createExpense",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error creating expense");

      return { expense: null, error: "Failed to create expense" };
    }
  }

  /**
   * Get expense by ID
   */
  static async getExpenseById(
    expenseId: number,
    userId: string
  ): Promise<{ expense: ExpenseWithCategory | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.debug({
      requestId,
      operation: "getExpenseById",
      userId,
      expenseId,
      timestamp: new Date().toISOString(),
    }, "Getting expense by ID");

    try {
      const result = await db
        .select({
          expense: expenses,
          category: categories,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.userId, userId)
          )
        )
        .limit(1);

      if (result.length === 0) {
        logger.warn({
          requestId,
          operation: "getExpenseById",
          userId,
          expenseId,
          timestamp: new Date().toISOString(),
        }, "Expense not found");

        return { expense: null, error: "Expense not found" };
      }

      const expenseWithCategory: ExpenseWithCategory = {
        ...result[0].expense,
        category: result[0].category,
      };

      logger.debug({
        requestId,
        operation: "getExpenseById",
        userId,
        expenseId,
        timestamp: new Date().toISOString(),
      }, "Expense retrieved successfully");

      return { expense: expenseWithCategory, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "getExpenseById",
        userId,
        expenseId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error getting expense by ID");

      return { expense: null, error: "Failed to get expense" };
    }
  }

  /**
   * Get expenses list with pagination
   */
  static async getExpenses(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: ExpenseListResponse | null; error: string | null }> {
    const requestId = crypto.randomUUID();
    const offset = (page - 1) * limit;

    logger.info({
      requestId,
      operation: "getExpenses",
      userId,
      page,
      limit,
      offset,
      timestamp: new Date().toISOString(),
    }, "Getting expenses list");

    try {
      // Get total count
      const [totalResult] = await db
        .select({ count: count() })
        .from(expenses)
        .where(eq(expenses.userId, userId));

      const total = totalResult.count;
      const totalPages = Math.ceil(total / limit);

      // Get expenses with categories
      const expensesList = await db
        .select({
          expense: expenses,
          category: categories,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .where(eq(expenses.userId, userId))
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(limit)
        .offset(offset);

      const expensesWithCategories: ExpenseWithCategory[] = expensesList.map(
        (item) => ({
          ...item.expense,
          category: item.category,
        })
      );

      const response: ExpenseListResponse = {
        expenses: expensesWithCategories,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };

      logger.info({
        requestId,
        operation: "getExpenses",
        userId,
        page,
        limit,
        total,
        totalPages,
        timestamp: new Date().toISOString(),
      }, "Expenses list retrieved successfully");

      return { data: response, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "getExpenses",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error getting expenses list");

      return { data: null, error: "Failed to get expenses" };
    }
  }

  /**
   * Update expense
   */
  static async updateExpense(
    expenseId: number,
    userId: string,
    updateData: UpdateExpenseRequest
  ): Promise<{ expense: ExpenseWithCategory | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "updateExpense",
      userId,
      expenseId,
      updateData,
      timestamp: new Date().toISOString(),
    }, "Updating expense");

    try {
      // Verify expense belongs to user
      const existingExpense = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.userId, userId)
          )
        )
        .limit(1);

      if (existingExpense.length === 0) {
        logger.warn({
          requestId,
          operation: "updateExpense",
          userId,
          expenseId,
          timestamp: new Date().toISOString(),
        }, "Expense not found or doesn't belong to user");

        return { expense: null, error: "Expense not found" };
      }

      // If updating category, verify it belongs to user
      if (updateData.categoryId) {
        const category = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.id, updateData.categoryId),
              eq(categories.userId, userId)
            )
          )
          .limit(1);

        if (category.length === 0) {
          logger.warn({
            requestId,
            operation: "updateExpense",
            userId,
            expenseId,
            categoryId: updateData.categoryId,
            timestamp: new Date().toISOString(),
          }, "Category not found or doesn't belong to user");

          return { expense: null, error: "Category not found" };
        }
      }

      // Prepare update data
      const updateFields: Partial<Expense> = {
        updatedAt: new Date(),
      };

      if (updateData.amount !== undefined) {
        updateFields.amount = updateData.amount.toString();
      }
      if (updateData.description !== undefined) {
        updateFields.description = updateData.description;
      }
      if (updateData.categoryId !== undefined) {
        updateFields.categoryId = updateData.categoryId;
      }
      if (updateData.expenseDate !== undefined) {
        updateFields.expenseDate = new Date(updateData.expenseDate);
      }

      // Update expense
      await db
        .update(expenses)
        .set(updateFields)
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.userId, userId)
          )
        );

      // Get updated expense with category
      const updatedExpense = await this.getExpenseById(expenseId, userId);

      logger.info({
        requestId,
        operation: "updateExpense",
        userId,
        expenseId,
        timestamp: new Date().toISOString(),
      }, "Expense updated successfully");

      return { expense: updatedExpense.expense, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "updateExpense",
        userId,
        expenseId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error updating expense");

      return { expense: null, error: "Failed to update expense" };
    }
  }

  /**
   * Delete expense
   */
  static async deleteExpense(
    expenseId: number,
    userId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "deleteExpense",
      userId,
      expenseId,
      timestamp: new Date().toISOString(),
    }, "Deleting expense");

    try {
      // Verify expense belongs to user and delete
      const result = await db
        .delete(expenses)
        .where(
          and(
            eq(expenses.id, expenseId),
            eq(expenses.userId, userId)
          )
        )
        .returning({ id: expenses.id });

      if (result.length === 0) {
        logger.warn({
          requestId,
          operation: "deleteExpense",
          userId,
          expenseId,
          timestamp: new Date().toISOString(),
        }, "Expense not found or doesn't belong to user");

        return { success: false, error: "Expense not found" };
      }

      logger.info({
        requestId,
        operation: "deleteExpense",
        userId,
        expenseId,
        timestamp: new Date().toISOString(),
      }, "Expense deleted successfully");

      return { success: true, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "deleteExpense",
        userId,
        expenseId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error deleting expense");

      return { success: false, error: "Failed to delete expense" };
    }
  }
}