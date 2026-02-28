import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { chatCompletion } from "../services/llm.service";
import { reportUsage } from "../services/billing.service";
import {
  logTransaction,
  updateBillingStatus,
} from "../services/transaction.service";
import { authMiddleware } from "../middleware/auth";
import type { ChatResponse } from "../types";

const router = Router();

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

router.post(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const requestId = uuidv4();
      const requestTimestamp = new Date();

      const body = chatRequestSchema.parse(req.body);

      const llmResponse = await chatCompletion(body.messages, body.model);
      const responseTimestamp = new Date();

      await logTransaction({
        userId: user.id,
        requestId,
        model: llmResponse.model,
        promptTokens: llmResponse.usage.promptTokens,
        completionTokens: llmResponse.usage.completionTokens,
        totalTokens: llmResponse.usage.totalTokens,
        requestTimestamp,
        responseTimestamp,
      });

      let billingStatus: "reported" | "failed" = "failed";
      let stripeMeterEventId: string | null = null;

      if (user.stripeCustomerId) {
        const report = await reportUsage(
          user.stripeCustomerId,
          llmResponse.usage.totalTokens,
          requestId,
        );

        if (report.success) {
          billingStatus = "reported";
          stripeMeterEventId = report.meterEventId;
        }
      }

      await updateBillingStatus(requestId, billingStatus, stripeMeterEventId);

      const response: ChatResponse = {
        requestId,
        model: llmResponse.model,
        message: llmResponse.message,
        usage: llmResponse.usage,
        billingStatus,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
