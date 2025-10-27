import { callOpenRouter, getInsightsPrompt, getSuggestionsPrompt } from "../../lib/openrouter";
import { db } from "../../db/drizzle";
import { expenses, categories } from "../../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import logger from "../../utils/logger";

export interface ExpenseAnalysis {
  totalAmount: number;
  categoryBreakdown: Array<{
    categoryName: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    amount: number;
  }>;
  insights: string;
}

export interface ExpenseSuggestions {
  suggestions: string[];
  priority: "low" | "medium" | "high";
}

export class AIService {
  static async healthCheck(): Promise<{ status: string; timestamp: string; service: string }> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "aiHealthCheck",
      timestamp: new Date().toISOString(),
    }, "AI service health check requested");

    try {
      const testResponse = await callOpenRouter([
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'OK' if you can process requests." }
      ], "mistralai/mistral-7b-instruct:free");

      logger.info({
        requestId,
        operation: "aiHealthCheck",
        aiResponse: testResponse,
        timestamp: new Date().toISOString(),
      }, "AI service health check successful");

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        service: "OpenRouter AI"
      };
    } catch (error) {
      logger.error({
        requestId,
        operation: "aiHealthCheck",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }, "AI service health check failed");

      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        service: "OpenRouter AI"
      };
    }
  }

  static async analyzeExpenses(userId: string, monthsBack: number = 3): Promise<ExpenseAnalysis> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "analyzeExpenses",
      userId,
      monthsBack,
      timestamp: new Date().toISOString(),
    }, "Starting expense analysis");

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsBack);

      const userExpenses = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          description: expenses.description,
          expenseDate: expenses.expenseDate,
          categoryName: categories.name,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.expenseDate, startDate),
            lte(expenses.expenseDate, endDate)
          )
        )
        .orderBy(desc(expenses.expenseDate));

      logger.info({
        requestId,
        operation: "analyzeExpenses",
        userId,
        expenseCount: userExpenses.length,
        dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        timestamp: new Date().toISOString(),
      }, "Retrieved user expenses for analysis");

      const totalAmount = userExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);

      const categoryMap = new Map<string, { amount: number; count: number }>();
      userExpenses.forEach(expense => {
        const current = categoryMap.get(expense.categoryName) || { amount: 0, count: 0 };
        categoryMap.set(expense.categoryName, {
          amount: current.amount + parseFloat(expense.amount),
          count: current.count + 1
        });
      });

      const categoryBreakdown = Array.from(categoryMap.entries()).map(([name, data]) => ({
        categoryName: name,
        amount: data.amount,
        percentage: totalAmount > 0 ? (data.amount / totalAmount) * 100 : 0,
        count: data.count
      })).sort((a, b) => b.amount - a.amount);

      const monthlyMap = new Map<string, number>();
      userExpenses.forEach(expense => {
        const monthKey = expense.expenseDate.toISOString().substring(0, 7);
        const current = monthlyMap.get(monthKey) || 0;
        monthlyMap.set(monthKey, current + parseFloat(expense.amount));
      });

      const monthlyTrend = Array.from(monthlyMap.entries()).map(([month, amount]) => ({
        month,
        amount
      })).sort((a, b) => a.month.localeCompare(b.month));

      const insights = await callOpenRouter([
        { role: "system", content: "You are a financial advisor. Provide concise, actionable insights about spending patterns." },
        { role: "user", content: getInsightsPrompt(userExpenses) }
      ], "mistralai/mistral-7b-instruct:free");

      logger.info({
        requestId,
        operation: "analyzeExpenses",
        userId,
        totalAmount,
        categoryCount: categoryBreakdown.length,
        monthlyDataPoints: monthlyTrend.length,
        timestamp: new Date().toISOString(),
      }, "Expense analysis completed successfully");

      return {
        totalAmount,
        categoryBreakdown,
        monthlyTrend,
        insights
      };

    } catch (error) {
      logger.error({
        requestId,
        operation: "analyzeExpenses",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Expense analysis failed");

      throw new Error("Failed to analyze expenses");
    }
  }

  static async getSuggestions(userId: string, monthsBack: number = 3): Promise<ExpenseSuggestions> {
    const requestId = crypto.randomUUID();

    logger.info({
      requestId,
      operation: "getSuggestions",
      userId,
      monthsBack,
      timestamp: new Date().toISOString(),
    }, "Starting expense suggestions generation");

    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - monthsBack);

      const userExpenses = await db
        .select({
          id: expenses.id,
          amount: expenses.amount,
          description: expenses.description,
          expenseDate: expenses.expenseDate,
          categoryName: categories.name,
        })
        .from(expenses)
        .innerJoin(categories, eq(expenses.categoryId, categories.id))
        .where(
          and(
            eq(expenses.userId, userId),
            gte(expenses.expenseDate, startDate),
            lte(expenses.expenseDate, endDate)
          )
        )
        .orderBy(desc(expenses.expenseDate));

      logger.info({
        requestId,
        operation: "getSuggestions",
        userId,
        expenseCount: userExpenses.length,
        timestamp: new Date().toISOString(),
      }, "Retrieved user expenses for suggestions");

      if (userExpenses.length === 0) {
        logger.info({
          requestId,
          operation: "getSuggestions",
          userId,
          timestamp: new Date().toISOString(),
        }, "No expenses found, returning default suggestions");

        return {
          suggestions: [
            "Start tracking your expenses to get personalized suggestions",
            "Set up a monthly budget for different categories",
            "Consider using automatic expense categorization"
          ],
          priority: "low"
        };
      }

      const suggestionsText = await callOpenRouter([
        { role: "system", content: "You are a financial coach. Provide 3-5 actionable, specific suggestions to help save money and optimize spending. Format each suggestion as a clear bullet point." },
        { role: "user", content: getSuggestionsPrompt(userExpenses) }
      ], "mistralai/mistral-7b-instruct:free");

      const suggestions = suggestionsText
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => line.length > 0 && (line.startsWith('-') || line.startsWith('•') || line.startsWith('*') || /^\d+\./.test(line)))
        .map((line: string) => line.replace(/^[-•*]\s*/, '').replace(/^\d+\.\s*/, ''))
        .slice(0, 5);

      const totalAmount = userExpenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
      const avgMonthlySpending = totalAmount / monthsBack;
      
      let priority: "low" | "medium" | "high" = "low";
      if (avgMonthlySpending > 3000) {
        priority = "high";
      } else if (avgMonthlySpending > 1500) {
        priority = "medium";
      }

      logger.info({
        requestId,
        operation: "getSuggestions",
        userId,
        suggestionCount: suggestions.length,
        priority,
        avgMonthlySpending,
        timestamp: new Date().toISOString(),
      }, "Expense suggestions generated successfully");

      return {
        suggestions,
        priority
      };

    } catch (error) {
      logger.error({
        requestId,
        operation: "getSuggestions",
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }, "Expense suggestions generation failed");

      throw new Error("Failed to generate suggestions");
    }
  }
}
