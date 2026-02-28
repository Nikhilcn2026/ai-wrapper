import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { getDb } from "../db/client";
import { transactions, users } from "../db/schema";
import type { BillingStatus, TransactionRecord, UsageSummary } from "../types";

export async function logTransaction(params: {
  userId: string;
  requestId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestTimestamp: Date;
  responseTimestamp: Date;
}): Promise<TransactionRecord> {
  const db = getDb();

  const [row] = await db
    .insert(transactions)
    .values({
      userId: params.userId,
      requestId: params.requestId,
      model: params.model,
      promptTokens: params.promptTokens,
      completionTokens: params.completionTokens,
      totalTokens: params.totalTokens,
      requestTimestamp: params.requestTimestamp,
      responseTimestamp: params.responseTimestamp,
      billingStatus: "pending",
    })
    .returning();

  return mapTransaction(row);
}

export async function updateBillingStatus(
  requestId: string,
  status: BillingStatus,
  stripeMeterEventId?: string | null,
): Promise<void> {
  const db = getDb();

  await db
    .update(transactions)
    .set({
      billingStatus: status,
      stripeMeterEventId: stripeMeterEventId ?? null,
    })
    .where(eq(transactions.requestId, requestId));
}

export async function getUsageByUser(
  userId: string,
  startDate?: Date,
  endDate?: Date,
): Promise<UsageSummary> {
  const db = getDb();

  const conditions = [eq(transactions.userId, userId)];
  if (startDate) {
    conditions.push(gte(transactions.requestTimestamp, startDate));
  }
  if (endDate) {
    conditions.push(lte(transactions.requestTimestamp, endDate));
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  const rows = await db
    .select()
    .from(transactions)
    .where(whereClause!)
    .orderBy(desc(transactions.requestTimestamp));

  const txns = rows.map(mapTransaction);
  const totalPromptTokens = txns.reduce((sum, t) => sum + t.promptTokens, 0);
  const totalCompletionTokens = txns.reduce(
    (sum, t) => sum + t.completionTokens,
    0,
  );
  const totalTokens = txns.reduce((sum, t) => sum + t.totalTokens, 0);

  return {
    userId,
    totalRequests: txns.length,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
    transactions: txns,
  };
}

export async function getTransactionByRequestId(
  requestId: string,
): Promise<TransactionRecord | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.requestId, requestId))
    .limit(1);

  return row ? mapTransaction(row) : null;
}

function mapTransaction(
  row: typeof transactions.$inferSelect,
): TransactionRecord {
  return {
    id: row.id,
    userId: row.userId,
    requestId: row.requestId,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    totalTokens: row.totalTokens,
    requestTimestamp: row.requestTimestamp,
    responseTimestamp: row.responseTimestamp,
    billingStatus: row.billingStatus,
    stripeMeterEventId: row.stripeMeterEventId,
    createdAt: row.createdAt,
  };
}
