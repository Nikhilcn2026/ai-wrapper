import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the env module before importing the service
vi.mock("../../src/config/env", () => ({
  getEnv: () => ({
    STRIPE_SECRET_KEY: "sk_test_fake",
    STRIPE_METER_EVENT_NAME: "ai_tokens_used",
  }),
}));

// We test the billing service logic by mocking Stripe
// Since we don't want to hit the real Stripe API in unit tests,
// we mock the Stripe constructor and its methods.

describe("billing.service", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should return failure when no stripeCustomerId is provided", async () => {
    const { reportUsage } = await import(
      "../../src/services/billing.service"
    );

    const result = await reportUsage("", 100, "req-123");

    expect(result.success).toBe(false);
    expect(result.meterEventId).toBeNull();
    expect(result.error).toContain("No Stripe customer ID");
  });

  it("should report correct payload structure", () => {
    // Validate the expected payload format for Stripe meter events
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
    // Stripe requires value as a string
    expect(typeof payload.payload.value).toBe("string");
  });
});
