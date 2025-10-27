import {
  pgTable,
  serial,
  text,
  numeric,
  uuid,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    fullName: text("full_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
    createdAtIdx: index("users_created_at_idx").on(table.createdAt),
  })
);

export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("categories_user_id_idx").on(table.userId),
    isDefaultIdx: index("categories_is_default_idx").on(table.isDefault),
    createdAtIdx: index("categories_created_at_idx").on(table.createdAt),
    userCategoryIdx: index("categories_user_category_idx").on(table.userId, table.name),
  })
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    description: text("description"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    expenseDate: timestamp("expense_date").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("expenses_user_id_idx").on(table.userId),
    categoryIdIdx: index("expenses_category_id_idx").on(table.categoryId),
    createdAtIdx: index("expenses_created_at_idx").on(table.createdAt),
    expenseDateIdx: index("expenses_expense_date_idx").on(table.expenseDate),
    userCategoryIdx: index("expenses_user_category_idx").on(table.userId, table.categoryId),
    userDateIdx: index("expenses_user_date_idx").on(table.userId, table.expenseDate),
  })
);
