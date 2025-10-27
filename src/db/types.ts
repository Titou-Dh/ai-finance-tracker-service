import {type InferSelectModel, type InferInsertModel } from "drizzle-orm";
import { users, categories, expenses } from "./schema";

// User types
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

// Category types
export type Category = InferSelectModel<typeof categories>;
export type NewCategory = InferInsertModel<typeof categories>;

// Expense types
export type Expense = InferSelectModel<typeof expenses>;
export type NewExpense = InferInsertModel<typeof expenses>;

// Extended types with relations
export type ExpenseWithCategory = Expense & {
  category: Category;
};

export type CategoryWithExpenseCount = Category & {
  expenseCount: number;
};

// API Request/Response types
export interface CreateExpenseRequest {
  amount: number;
  description?: string;
  categoryId: number;
  expenseDate?: string;
}

export interface UpdateExpenseRequest {
  amount?: number;
  description?: string;
  categoryId?: number;
  expenseDate?: string;
}

export interface CreateCategoryRequest {
  name: string;
  description?: string;
}

export interface UpdateCategoryRequest {
  name?: string;
  description?: string;
}

export interface ExpenseListResponse {
  expenses: ExpenseWithCategory[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface CategoryListResponse {
  categories: CategoryWithExpenseCount[];
}

// Default categories
export const DEFAULT_CATEGORIES = [
  { name: "Food & Dining", description: "Restaurants, groceries, and food expenses" },
  { name: "Transportation", description: "Gas, public transport, rideshare" },
  { name: "Shopping", description: "Clothing, electronics, general shopping" },
  { name: "Entertainment", description: "Movies, games, subscriptions" },
  { name: "Bills & Utilities", description: "Electricity, water, internet, phone" },
  { name: "Healthcare", description: "Medical expenses, pharmacy, insurance" },
  { name: "Travel", description: "Hotels, flights, vacation expenses" },
  { name: "Education", description: "Books, courses, school supplies" },
  { name: "Home & Garden", description: "Furniture, home improvement, gardening" },
  { name: "Other", description: "Miscellaneous expenses" },
];
