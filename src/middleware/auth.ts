import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { users } from "../db/schema";
import type { UserRecord } from "../types";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

/**
 * Middleware that authenticates requests via the X-API-Key header.
 * Looks up the user by API key in the database.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers["x-api-key"] as string | undefined;

  if (!apiKey) {
    res.status(401).json({
      error: "Unauthorized",
      message: "Missing X-API-Key header",
    });
    return;
  }

  try {
    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.apiKey, apiKey))
      .limit(1);

    if (!user) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key",
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      stripeCustomerId: user.stripeCustomerId,
      apiKey: user.apiKey,
      createdAt: user.createdAt,
    };

    next();
  } catch (error) {
    next(error);
  }
}
