import { Router, Request, Response } from "express";
import { checkDbConnection } from "../db/client";
import type { HealthStatus } from "../types";

const router = Router();

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const dbConnected = await checkDbConnection();

  const status: HealthStatus = {
    status: dbConnected ? "ok" : "error",
    db: dbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  };

  const httpStatus = dbConnected ? 200 : 503;
  res.status(httpStatus).json(status);
});

export default router;
