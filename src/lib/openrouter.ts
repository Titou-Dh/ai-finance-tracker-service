import axios from "axios";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY!;
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AIRequest {
  messages: { role: "user" | "system"; content: string }[];
  model?: string;
}

export async function callOpenRouter(
  messages: AIRequest["messages"],
  model = "mistralai/mistral-7b-instruct:free"
) {
  try {
    const res = await axios.post(
      OPENROUTER_BASE_URL,
      { model, messages },
      { headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` } }
    );
    return res.data.choices[0].message.content;
  } catch (err: any) {
    console.error("OpenRouter API error:", err.response?.data || err.message);
    throw new Error("AI service failed");
  }
}

export function getInsightsPrompt(userExpenses: any[]) {
  return `You are a financial assistant. Analyze the following expenses and provide a brief monthly summary with highlights, like which categories dominate spending, any unusual spikes, and potential warnings. 
Expenses JSON: ${JSON.stringify(userExpenses)}`;
}

export function getSuggestionsPrompt(userExpenses: any[]) {
  return `You are a financial coach. Based on these user expenses, provide actionable suggestions to save money, optimize spending, or adjust budgets. Format in bullets.
Expenses JSON: ${JSON.stringify(userExpenses)}`;
}
