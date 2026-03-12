import express, { RequestHandler } from "express";
import {
  exerciseHistoryQuerySchema,
  exerciseHistoryResponseSchema,
} from "@workspace/shared";
import { getExerciseEntryHistory } from "../../services/exerciseEntryHistoryService";

const { log } = require("../../config/logging");
const checkPermissionMiddleware = require("../../middleware/checkPermissionMiddleware");
const { canAccessUserData } = require("../../utils/permissionUtils");

const router = express.Router();

router.use(checkPermissionMiddleware("diary"));

/**
 * @swagger
 * /v2/exercise-entries/history:
 *   get:
 *     summary: Get paginated exercise entry history
 *     tags: [Fitness & Workouts]
 *     description: Returns paginated exercise sessions (preset groups and standalone entries) sorted by date descending.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number (1-based)
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of sessions per page (max 100)
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Optional user ID for family access
 *     responses:
 *       200:
 *         description: Paginated exercise history
 *       403:
 *         description: User does not have permission to access this resource
 *       500:
 *         description: Internal server error
 */
const historyHandler: RequestHandler = async (req, res, next) => {
  try {
    const parsedQuery = exerciseHistoryQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      res.status(400).json({
        error: "Invalid query parameters",
        details: parsedQuery.error.flatten().fieldErrors,
      });
      return;
    }

    const { page, pageSize, userId: queryUserId } = parsedQuery.data;

    // Family access permission check
    const targetUserId = queryUserId || req.userId;

    const actorUserId = req.originalUserId || req.userId;

    if (queryUserId && queryUserId !== actorUserId) {
      const hasPermission = await canAccessUserData(
        queryUserId,
        "diary",
        actorUserId,
      );
      if (!hasPermission) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const result = await getExerciseEntryHistory(targetUserId, page, pageSize);
    const response = exerciseHistoryResponseSchema.parse(result);
    res.status(200).json(response);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ZodError") {
      log("error", "v2 exercise history response validation failed:", error);
      next(
        Object.assign(new Error("Internal response validation failed"), {
          status: 500,
        }),
      );
      return;
    }
    next(error);
  }
};

router.get("/history", historyHandler);

module.exports = router;
