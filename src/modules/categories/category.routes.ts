import { Elysia, t } from "elysia";
import { CategoryService } from "./category.service";
import { authPlugin } from "../../plugins/auth.plugin";
import logger from "../../utils/logger";
import type {
  CreateCategoryRequest,
  UpdateCategoryRequest,
} from "../../db/types";

// Validation schemas
const createCategorySchema = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  description: t.Optional(t.String({ maxLength: 500 })),
});

const updateCategorySchema = t.Object({
  name: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
  description: t.Optional(t.String({ maxLength: 500 })),
});

const categoryParamsSchema = t.Object({
  id: t.String(),
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

export const categoryRoutes = new Elysia({
  prefix: "/categories",
  tags: ["Categories"],
})
  .use(authPlugin)
  .derive(async ({ getUser, cookie }) => {
    const user = await getUser(cookie);
    if (!user) {
      throw new Error("Authentication required");
    }
    return { user };
  })
  .post(
    "/",
    async ({ body, user, set }) => {
      const requestId = crypto.randomUUID();
      const categoryData = body as CreateCategoryRequest;

      logger.info(
        {
          requestId,
          operation: "createCategory",
          userId: user.id,
          name: categoryData.name,
          timestamp: new Date().toISOString(),
        },
        "Creating new category"
      );

      try {
        const { category, error } = await CategoryService.createCategory(
          user.id,
          categoryData
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "createCategory",
              userId: user.id,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Category creation failed"
          );

          set.status = 400;
          return createResponse(
            false,
            "Failed to create category",
            null,
            error || "Unknown error"
          );
        }

        logger.info(
          {
            requestId,
            operation: "createCategory",
            userId: user.id,
            categoryId: category?.id,
            status: 201,
            timestamp: new Date().toISOString(),
          },
          "Category created successfully"
        );

        set.status = 201;
        return createResponse(true, "Category created successfully", category);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "createCategory",
            userId: user.id,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Category creation error"
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
      body: createCategorySchema,
      detail: {
        summary: "Create category",
        description: "Create a new category",
        tags: ["Categories"],
      },
    }
  )
  .get(
    "/",
    async ({ user, set }) => {
      const requestId = crypto.randomUUID();

      logger.info(
        {
          requestId,
          operation: "getCategories",
          userId: user.id,
          timestamp: new Date().toISOString(),
        },
        "Getting categories list"
      );

      try {
        const { data, error } = await CategoryService.getCategories(user.id);

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "getCategories",
              userId: user.id,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Failed to get categories"
          );

          set.status = 400;
          return createResponse(
            false,
            "Failed to get categories",
            null,
            error || "Unknown error"
          );
        }

        logger.info(
          {
            requestId,
            operation: "getCategories",
            userId: user.id,
            categoryCount: data?.categories.length,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Categories retrieved successfully"
        );

        set.status = 200;
        return createResponse(true, "Categories retrieved successfully", data);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "getCategories",
            userId: user.id,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error getting categories"
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
      detail: {
        summary: "Get categories",
        description: "Get list of categories",
        tags: ["Categories"],
      },
    }
  )
  .get(
    "/:id",
    async ({ params, user, set }) => {
      const requestId = crypto.randomUUID();
      const categoryId = parseInt(params.id);

      logger.info(
        {
          requestId,
          operation: "getCategoryById",
          userId: user.id,
          categoryId,
          timestamp: new Date().toISOString(),
        },
        "Getting category by ID"
      );

      try {
        const { category, error } = await CategoryService.getCategoryById(
          categoryId,
          user.id
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "getCategoryById",
              userId: user.id,
              categoryId,
              error,
              status: 404,
              timestamp: new Date().toISOString(),
            },
            "Category not found"
          );

          set.status = 404;
          return createResponse(
            false,
            "Category not found",
            null,
            error || "Unknown error"
          );
        }

        logger.info(
          {
            requestId,
            operation: "getCategoryById",
            userId: user.id,
            categoryId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Category retrieved successfully"
        );

        set.status = 200;
        return createResponse(
          true,
          "Category retrieved successfully",
          category
        );
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "getCategoryById",
            userId: user.id,
            categoryId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error getting category"
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
      params: categoryParamsSchema,
      detail: {
        summary: "Get category by ID",
        description: "Get a specific category by ID",
        tags: ["Categories"],
      },
    }
  )
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      const requestId = crypto.randomUUID();
      const categoryId = parseInt(params.id);
      const updateData = body as UpdateCategoryRequest;

      logger.info(
        {
          requestId,
          operation: "updateCategory",
          userId: user.id,
          categoryId,
          updateData,
          timestamp: new Date().toISOString(),
        },
        "Updating category"
      );

      try {
        const { category, error } = await CategoryService.updateCategory(
          categoryId,
          user.id,
          updateData
        );

        if (error) {
          logger.warn(
            {
              requestId,
              operation: "updateCategory",
              userId: user.id,
              categoryId,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Category update failed"
          );

          set.status = 400;
          return createResponse(
            false,
            "Failed to update category",
            null,
            error || "Unknown error"
          );
        }

        logger.info(
          {
            requestId,
            operation: "updateCategory",
            userId: user.id,
            categoryId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Category updated successfully"
        );

        set.status = 200;
        return createResponse(true, "Category updated successfully", category);
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "updateCategory",
            userId: user.id,
            categoryId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error updating category"
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
      params: categoryParamsSchema,
      body: updateCategorySchema,
      detail: {
        summary: "Update category",
        description: "Update an existing category",
        tags: ["Categories"],
      },
    }
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const requestId = crypto.randomUUID();
      const categoryId = parseInt(params.id);

      logger.info(
        {
          requestId,
          operation: "deleteCategory",
          userId: user.id,
          categoryId,
          timestamp: new Date().toISOString(),
        },
        "Deleting category"
      );

      try {
        const { success, error } = await CategoryService.deleteCategory(
          categoryId,
          user.id
        );

        if (!success) {
          logger.warn(
            {
              requestId,
              operation: "deleteCategory",
              userId: user.id,
              categoryId,
              error,
              status: 400,
              timestamp: new Date().toISOString(),
            },
            "Category deletion failed"
          );

          set.status = 400;
          return createResponse(
            false,
            "Failed to delete category",
            null,
            error || "Unknown error"
          );
        }

        logger.info(
          {
            requestId,
            operation: "deleteCategory",
            userId: user.id,
            categoryId,
            status: 200,
            timestamp: new Date().toISOString(),
          },
          "Category deleted successfully"
        );

        set.status = 200;
        return createResponse(true, "Category deleted successfully");
      } catch (error) {
        logger.error(
          {
            requestId,
            operation: "deleteCategory",
            userId: user.id,
            categoryId,
            error: error instanceof Error ? error.message : "Unknown error",
            stack: error instanceof Error ? error.stack : undefined,
            status: 500,
            timestamp: new Date().toISOString(),
          },
          "Error deleting category"
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
      params: categoryParamsSchema,
      detail: {
        summary: "Delete category",
        description: "Delete a category",
        tags: ["Categories"],
      },
    }
  );
