// ============================================
// Shared TypeScript types
// ============================================

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  requestId: string;
  model: string;
  message: ChatMessage;
  usage: TokenUsage;
  billingStatus: BillingStatus;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type BillingStatus = "pending" | "reported" | "failed";

export interface TransactionRecord {
  id: string;
  userId: string;
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestTimestamp: Date;
  responseTimestamp: Date;
  billingStatus: BillingStatus;
  stripeMeterEventId: string | null;
  createdAt: Date;
}

export interface UsageSummary {
  userId: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  transactions: TransactionRecord[];
}

export interface UserRecord {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  apiKey: string;
  createdAt: Date;
}

export interface HealthStatus {
  status: "ok" | "error";
  db: "connected" | "disconnected";
  timestamp: string;
}
