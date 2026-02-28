import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import OpenAI from "openai";
import Stripe from "stripe";
import { LLMError } from "../services/llm.service";

/**
 * Global Express error handler.
 * Maps known error types to appropriate HTTP responses.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(`[Error] ${err.name}: ${err.message}`);

  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation Error",
      details: err.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    });
    return;
  }

  // OpenAI SDK errors (covers OpenRouter)
  if (err instanceof OpenAI.APIError) {
    const status = err.status || 502;
    res.status(status).json({
      error: "LLM Error",
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Custom LLM errors
  if (err instanceof LLMError) {
    res.status(502).json({
      error: "LLM Error",
      message: err.message,
      code: err.code,
    });
    return;
  }

  // Stripe errors
  if (err instanceof Stripe.errors.StripeError) {
    res.status(502).json({
      error: "Billing Error",
      message: err.message,
      type: err.type,
    });
    return;
  }

  // Default: internal server error
  res.status(500).json({
    error: "Internal Server Error",
    message:
      process.env.NODE_ENV === "production"
        ? "An unexpected error occurred"
        : err.message,
  });
}
