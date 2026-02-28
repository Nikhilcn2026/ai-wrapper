import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().min(1),
      }),
    )
    .min(1, "At least one message is required"),
  model: z.string().optional().default("openai/gpt-3.5-turbo"),
});

describe("Chat request validation", () => {
  it("should accept a valid chat request", () => {
    const input = {
      messages: [{ role: "user", content: "Hello, how are you?" }],
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("openai/gpt-3.5-turbo");
      expect(result.data.messages).toHaveLength(1);
    }
  });

  it("should accept a request with a custom model", () => {
    const input = {
      messages: [{ role: "user", content: "Hello" }],
      model: "anthropic/claude-3-haiku",
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.model).toBe("anthropic/claude-3-haiku");
    }
  });

  it("should reject empty messages array", () => {
    const input = { messages: [] };
    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject messages with empty content", () => {
    const input = {
      messages: [{ role: "user", content: "" }],
    };
    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should reject invalid role", () => {
    const input = {
      messages: [{ role: "admin", content: "Hello" }],
    };
    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("should accept multi-turn conversations", () => {
    const input = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
        { role: "user", content: "And 3+3?" },
      ],
    };

    const result = chatRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages).toHaveLength(4);
    }
  });
});

describe("Environment validation", () => {
  it("should validate PORT as a positive integer", () => {
    const portSchema = z
      .string()
      .default("3000")
      .transform(Number)
      .pipe(z.number().int().positive());

    expect(portSchema.parse("8080")).toBe(8080);
    expect(portSchema.parse("3000")).toBe(3000);
    expect(portSchema.parse(undefined)).toBe(3000);
  });

  it("should reject invalid PORT values", () => {
    const portSchema = z
      .string()
      .transform(Number)
      .pipe(z.number().int().positive());

    expect(() => portSchema.parse("abc")).toThrow();
    expect(() => portSchema.parse("-1")).toThrow();
    expect(() => portSchema.parse("0")).toThrow();
  });
});
