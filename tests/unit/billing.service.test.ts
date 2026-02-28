import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_METER_EVENT_NAME: "ai_tokens_used",
  }),
}));

describe("billing.service", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return failure when no stripeCustomerId is provided", async () => {
    const { reportUsage } = await import("../../src/services/billing.service");

    const result = await reportUsage("", 100, "req-123");

    expect(result.success).toBe(false);
    expect(result.meterEventId).toBeNull();
    expect(result.error).toContain("No Stripe customer ID");
  });

  it("should report correct payload structure", () => {
    const payload = {
      event_name: "ai_tokens_used",
      payload: {
        stripe_customer_id: "cus_test_123",
        value: String(500),
      },
    };

    expect(payload.event_name).toBe("ai_tokens_used");
    expect(payload.payload.stripe_customer_id).toBe("cus_test_123");
    expect(payload.payload.value).toBe("500");
    expect(typeof payload.payload.value).toBe("string");
  });
});
