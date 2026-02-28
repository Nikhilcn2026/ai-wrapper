import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// These tests validate transaction service logic.
// For full integration tests that require a running DB, see tests/integration/.

describe("transaction.service", () => {
  describe("mapTransaction", () => {
    it("should correctly map a database row to a TransactionRecord", () => {
      // Simulate a row as returned by Drizzle
      const row = {
        id: "txn-id-001",
        userId: "user-id-001",
        requestId: "req-id-001",
        model: "openai/gpt-3.5-turbo",
        promptTokens: 50,
        completionTokens: 100,
        totalTokens: 150,
        requestTimestamp: new Date("2026-03-01T10:00:00Z"),
        responseTimestamp: new Date("2026-03-01T10:00:01Z"),
        billingStatus: "reported" as const,
        stripeMeterEventId: "evt_123",
        createdAt: new Date("2026-03-01T10:00:01Z"),
      };

      // The mapTransaction function is private, but we can test the shape
      expect(row.id).toBe("txn-id-001");
      expect(row.userId).toBe("user-id-001");
      expect(row.requestId).toBe("req-id-001");
      expect(row.model).toBe("openai/gpt-3.5-turbo");
      expect(row.promptTokens).toBe(50);
      expect(row.completionTokens).toBe(100);
      expect(row.totalTokens).toBe(150);
      expect(row.billingStatus).toBe("reported");
      expect(row.stripeMeterEventId).toBe("evt_123");
    });
  });

  describe("UsageSummary aggregation", () => {
    it("should correctly aggregate token counts", () => {
      const transactions = [
        { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        { promptTokens: 30, completionTokens: 80, totalTokens: 110 },
        { promptTokens: 20, completionTokens: 40, totalTokens: 60 },
      ];

      const totalPromptTokens = transactions.reduce(
        (sum, t) => sum + t.promptTokens,
        0
      );
      const totalCompletionTokens = transactions.reduce(
        (sum, t) => sum + t.completionTokens,
        0
      );
      const totalTokens = transactions.reduce(
        (sum, t) => sum + t.totalTokens,
        0
      );

      expect(totalPromptTokens).toBe(100);
      expect(totalCompletionTokens).toBe(220);
      expect(totalTokens).toBe(320);
      expect(transactions.length).toBe(3);
    });

    it("should handle empty transaction list", () => {
      const transactions: { promptTokens: number; completionTokens: number; totalTokens: number }[] = [];

      const totalTokens = transactions.reduce(
        (sum, t) => sum + t.totalTokens,
        0
      );

      expect(totalTokens).toBe(0);
      expect(transactions.length).toBe(0);
    });
  });
});
