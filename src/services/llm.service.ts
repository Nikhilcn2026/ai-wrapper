import OpenAI from "openai";
import { getEnv } from "../config/env";
import type { ChatMessage, TokenUsage } from "../types";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const env = getEnv();
    _client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://ai-billing-engine.local",
        "X-Title": "AI Billing Engine",
      },
    });
  }
  return _client;
}

export interface LLMResponse {
  message: ChatMessage;
  model: string;
  usage: TokenUsage;
}

/**
 * Send a chat completion request to OpenRouter.
 * Returns the assistant message and token usage.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  model: string = "openai/gpt-3.5-turbo"
): Promise<LLMResponse> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const choice = response.choices[0];
  if (!choice || !choice.message) {
    throw new LLMError("No response from LLM", "NO_RESPONSE");
  }

  const usage = response.usage;

  return {
    message: {
      role: "assistant",
      content: choice.message.content || "",
    },
    model: response.model || model,
    usage: {
      promptTokens: usage?.prompt_tokens ?? 0,
      completionTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    },
  };
}

// ---- Custom Error ----

export class LLMError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LLMError";
    this.code = code;
  }
}
