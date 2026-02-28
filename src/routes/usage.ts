import { Router, Request, Response, NextFunction } from "express";
import { getUsageByUser } from "../services/transaction.service";
import { authMiddleware } from "../middleware/auth";

const router = Router();

router.get(
  "/:userId",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId } = req.params;
      const user = req.user!;

      if (user.id !== userId) {
        res.status(403).json({
          error: "Forbidden",
          message: "You can only view your own usage",
        });
        return;
      }

      const startDate = req.query.start
        ? new Date(req.query.start as string)
        : undefined;
      const endDate = req.query.end
        ? new Date(req.query.end as string)
        : undefined;

      const usage = await getUsageByUser(userId, startDate, endDate);

      res.json(usage);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;

      const startDate = req.query.start
        ? new Date(req.query.start as string)
        : undefined;
      const endDate = req.query.end
        ? new Date(req.query.end as string)
        : undefined;

      const usage = await getUsageByUser(user.id, startDate, endDate);

      res.json(usage);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
