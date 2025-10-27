import { db } from "../../db/drizzle";
import { categories, expenses } from "../../db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";
import type {
  Category,
  NewCategory,
  CategoryWithExpenseCount,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  CategoryListResponse,
} from "../../db/types";
import { DEFAULT_CATEGORIES } from "../../db/types";
import logger from "../../utils/logger";

export class CategoryService {
  /**
   * Create default categories for a new user
   */
  static async createDefaultCategories(userId: string): Promise<{ success: boolean; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "createDefaultCategories",
      userId,
      categoryCount: DEFAULT_CATEGORIES.length,
      timestamp: new Date().toISOString(),
    }, "Creating default categories for new user");

    try {
      const defaultCategories: NewCategory[] = DEFAULT_CATEGORIES.map(category => ({
        name: category.name,
        description: category.description,
        userId,
        isDefault: true,
      }));

      await db.insert(categories).values(defaultCategories);

      logger.info({
        requestId,
        operation: "createDefaultCategories",
        userId,
        timestamp: new Date().toISOString(),
      }, "Default categories created successfully");

      return { success: true, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "createDefaultCategories",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error creating default categories");

      return { success: false, error: "Failed to create default categories" };
    }
  }

  /**
   * Create a new category
   */
  static async createCategory(
    userId: string,
    categoryData: CreateCategoryRequest
  ): Promise<{ category: Category | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "createCategory",
      userId,
      name: categoryData.name,
      timestamp: new Date().toISOString(),
    }, "Creating new category");

    try {
      // Check if category with same name already exists for user
      const existingCategory = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.name, categoryData.name),
            eq(categories.userId, userId)
          )
        )
        .limit(1);

      if (existingCategory.length > 0) {
        logger.warn({
          requestId,
          operation: "createCategory",
          userId,
          name: categoryData.name,
          timestamp: new Date().toISOString(),
        }, "Category with same name already exists");

        return { category: null, error: "Category with this name already exists" };
      }

      const newCategory: NewCategory = {
        name: categoryData.name,
        description: categoryData.description,
        userId,
        isDefault: false,
      };

      const [createdCategory] = await db
        .insert(categories)
        .values(newCategory)
        .returning();

      logger.info({
        requestId,
        operation: "createCategory",
        userId,
        categoryId: createdCategory.id,
        timestamp: new Date().toISOString(),
      }, "Category created successfully");

      return { category: createdCategory, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "createCategory",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error creating category");

      return { category: null, error: "Failed to create category" };
    }
  }

  /**
   * Get category by ID
   */
  static async getCategoryById(
    categoryId: number,
    userId: string
  ): Promise<{ category: CategoryWithExpenseCount | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.debug({
      requestId,
      operation: "getCategoryById",
      userId,
      categoryId,
      timestamp: new Date().toISOString(),
    }, "Getting category by ID");

    try {
      const result = await db
        .select({
          category: categories,
          expenseCount: count(expenses.id),
        })
        .from(categories)
        .leftJoin(expenses, eq(categories.id, expenses.categoryId))
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.userId, userId)
          )
        )
        .groupBy(categories.id)
        .limit(1);

      if (result.length === 0) {
        logger.warn({
          requestId,
          operation: "getCategoryById",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Category not found");

        return { category: null, error: "Category not found" };
      }

      const categoryWithCount: CategoryWithExpenseCount = {
        ...result[0].category,
        expenseCount: result[0].expenseCount,
      };

      logger.debug({
        requestId,
        operation: "getCategoryById",
        userId,
        categoryId,
        timestamp: new Date().toISOString(),
      }, "Category retrieved successfully");

      return { category: categoryWithCount, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "getCategoryById",
        userId,
        categoryId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error getting category by ID");

      return { category: null, error: "Failed to get category" };
    }
  }

  /**
   * Get categories list
   */
  static async getCategories(
    userId: string
  ): Promise<{ data: CategoryListResponse | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "getCategories",
      userId,
      timestamp: new Date().toISOString(),
    }, "Getting categories list");

    try {
      const categoriesList = await db
        .select({
          category: categories,
          expenseCount: count(expenses.id),
        })
        .from(categories)
        .leftJoin(expenses, eq(categories.id, expenses.categoryId))
        .where(eq(categories.userId, userId))
        .groupBy(categories.id)
        .orderBy(desc(categories.isDefault), categories.name);

      const categoriesWithCount: CategoryWithExpenseCount[] = categoriesList.map(
        (item) => ({
          ...item.category,
          expenseCount: item.expenseCount,
        })
      );

      const response: CategoryListResponse = {
        categories: categoriesWithCount,
      };

      logger.info({
        requestId,
        operation: "getCategories",
        userId,
        categoryCount: categoriesWithCount.length,
        timestamp: new Date().toISOString(),
      }, "Categories list retrieved successfully");

      return { data: response, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "getCategories",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error getting categories list");

      return { data: null, error: "Failed to get categories" };
    }
  }

  /**
   * Update category
   */
  static async updateCategory(
    categoryId: number,
    userId: string,
    updateData: UpdateCategoryRequest
  ): Promise<{ category: Category | null; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "updateCategory",
      userId,
      categoryId,
      updateData,
      timestamp: new Date().toISOString(),
    }, "Updating category");

    try {
      // Verify category belongs to user and is not default
      const existingCategory = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.userId, userId)
          )
        )
        .limit(1);

      if (existingCategory.length === 0) {
        logger.warn({
          requestId,
          operation: "updateCategory",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Category not found or doesn't belong to user");

        return { category: null, error: "Category not found" };
      }

      if (existingCategory[0].isDefault) {
        logger.warn({
          requestId,
          operation: "updateCategory",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Cannot update default category");

        return { category: null, error: "Cannot update default category" };
      }

      // Check if new name conflicts with existing category
      if (updateData.name && updateData.name !== existingCategory[0].name) {
        const conflictingCategory = await db
          .select()
          .from(categories)
          .where(
            and(
              eq(categories.name, updateData.name),
              eq(categories.userId, userId),
              sql`${categories.id} != ${categoryId}`
            )
          )
          .limit(1);

        if (conflictingCategory.length > 0) {
          logger.warn({
            requestId,
            operation: "updateCategory",
            userId,
            categoryId,
            name: updateData.name,
            timestamp: new Date().toISOString(),
          }, "Category with same name already exists");

          return { category: null, error: "Category with this name already exists" };
        }
      }

      // Prepare update data
      const updateFields: Partial<Category> = {
        updatedAt: new Date(),
      };

      if (updateData.name !== undefined) {
        updateFields.name = updateData.name;
      }
      if (updateData.description !== undefined) {
        updateFields.description = updateData.description;
      }

      // Update category
      const [updatedCategory] = await db
        .update(categories)
        .set(updateFields)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.userId, userId)
          )
        )
        .returning();

      logger.info({
        requestId,
        operation: "updateCategory",
        userId,
        categoryId,
        timestamp: new Date().toISOString(),
      }, "Category updated successfully");

      return { category: updatedCategory, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "updateCategory",
        userId,
        categoryId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error updating category");

      return { category: null, error: "Failed to update category" };
    }
  }

  /**
   * Delete category
   */
  static async deleteCategory(
    categoryId: number,
    userId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "deleteCategory",
      userId,
      categoryId,
      timestamp: new Date().toISOString(),
    }, "Deleting category");

    try {
      // Verify category belongs to user and is not default
      const existingCategory = await db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.userId, userId)
          )
        )
        .limit(1);

      if (existingCategory.length === 0) {
        logger.warn({
          requestId,
          operation: "deleteCategory",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Category not found or doesn't belong to user");

        return { success: false, error: "Category not found" };
      }

      if (existingCategory[0].isDefault) {
        logger.warn({
          requestId,
          operation: "deleteCategory",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Cannot delete default category");

        return { success: false, error: "Cannot delete default category" };
      }

      // Check if category has expenses
      const expenseCount = await db
        .select({ count: count() })
        .from(expenses)
        .where(eq(expenses.categoryId, categoryId))
        .limit(1);

      if (expenseCount[0].count > 0) {
        logger.warn({
          requestId,
          operation: "deleteCategory",
          userId,
          categoryId,
          expenseCount: expenseCount[0].count,
          timestamp: new Date().toISOString(),
        }, "Cannot delete category with existing expenses");

        return { success: false, error: "Cannot delete category with existing expenses" };
      }

      // Delete category
      const result = await db
        .delete(categories)
        .where(
          and(
            eq(categories.id, categoryId),
            eq(categories.userId, userId)
          )
        )
        .returning({ id: categories.id });

      if (result.length === 0) {
        logger.warn({
          requestId,
          operation: "deleteCategory",
          userId,
          categoryId,
          timestamp: new Date().toISOString(),
        }, "Category not found or doesn't belong to user");

        return { success: false, error: "Category not found" };
      }

      logger.info({
        requestId,
        operation: "deleteCategory",
        userId,
        categoryId,
        timestamp: new Date().toISOString(),
      }, "Category deleted successfully");

      return { success: true, error: null };
    } catch (error) {
      logger.error({
        requestId,
        operation: "deleteCategory",
        userId,
        categoryId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Error deleting category");

      return { success: false, error: "Failed to delete category" };
    }
  }
}