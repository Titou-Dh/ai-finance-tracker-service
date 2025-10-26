import {
  pgTable,
  serial,
  text,
  numeric,
  uuid,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const categoryOfExpenses = pgTable("category_of_expenses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  userId: uuid("user_id").references(() => users.id),
  isDefault: boolean("is_default").default(false),
});

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  amount: numeric("amount").notNull(),
  description: text("description"),
  categoryId: integer("category_id").references(() => categoryOfExpenses.id),
  userId: uuid("user_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
});
