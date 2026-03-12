const express = require("express");
const { z } = require("zod");
const {
  createPresetSessionRequestSchema,
  updatePresetSessionRequestSchema,
  presetSessionResponseSchema,
} = require("@workspace/shared");
const exercisePresetEntryRepository = require("../models/exercisePresetEntryRepository");
const exerciseService = require("../services/exerciseService");
const { log } = require("../config/logging");

const router = express.Router();
const presetEntryIdParamSchema = z.object({
  id: z.string().uuid(),
});

const isAuthenticated = (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
};

function sendValidationError(res, message, error) {
  return res.status(400).json({
    error: message,
    details: error.flatten(),
  });
}

function handleRouteError(error, res, next) {
  if (error?.status) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error instanceof z.ZodError) {
    log("error", "Grouped workout response validation failed:", error);
    return next(
      Object.assign(new Error("Internal response validation failed"), {
        status: 500,
      }),
    );
  }

  return next(error);
}

/**
 * @swagger
 * tags:
 *   name: Fitness & Workouts
 *   description: Exercise database, workout presets, and activity logging.
 */

/**
 * @swagger
 * /exercise-preset-entries:
 *   post:
 *     summary: Create a grouped workout session
 *     tags: [Fitness & Workouts]
 *     description: Creates a grouped workout from either a workout preset or an inline exercises array. Returns the full nested grouped session payload used by the mobile client.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       201:
 *         description: The grouped workout session was created successfully.
 *       400:
 *         description: Invalid request body.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Workout preset not found.
 */
router.post("/", isAuthenticated, async (req, res, next) => {
  try {
    const parsedBody = createPresetSessionRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendValidationError(
        res,
        "Invalid grouped workout payload.",
        parsedBody.error,
      );
    }

    const groupedWorkout = await exerciseService.createGroupedWorkoutSession(
      req.userId,
      req.originalUserId || req.userId,
      parsedBody.data,
    );

    const response = presetSessionResponseSchema.parse(groupedWorkout);
    res.status(201).json(response);
  } catch (error) {
    log("error", "Error creating grouped workout session:", error);
    handleRouteError(error, res, next);
  }
});

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   get:
 *     summary: Get a grouped workout session by ID
 *     tags: [Fitness & Workouts]
 *     description: Returns the full nested grouped workout session, including child exercises and sets.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The grouped workout session.
 *       400:
 *         description: Invalid grouped workout ID.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Grouped workout session not found.
 */
router.get("/:id", isAuthenticated, async (req, res, next) => {
  try {
    const parsedParams = presetEntryIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return sendValidationError(
        res,
        "Invalid grouped workout id.",
        parsedParams.error,
      );
    }

    const groupedWorkout = await exerciseService.getGroupedWorkoutSessionById(
      req.userId,
      parsedParams.data.id,
    );

    if (!groupedWorkout) {
      return res
        .status(404)
        .json({ message: "Exercise preset entry not found." });
    }

    const response = presetSessionResponseSchema.parse(groupedWorkout);
    res.status(200).json(response);
  } catch (error) {
    log("error", `Error getting grouped workout session ${req.params.id}:`, error);
    handleRouteError(error, res, next);
  }
});

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   put:
 *     summary: Update a grouped workout session
 *     tags: [Fitness & Workouts]
 *     description: Updates grouped workout header fields and, for manual or sparky workouts, can replace the child exercises array in one request. Returns the full nested grouped session payload.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: The grouped workout session was updated successfully.
 *       400:
 *         description: Invalid request body or grouped workout ID.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Grouped workout session not found.
 *       409:
 *         description: Nested exercise edits are not supported for synced/imported grouped workouts.
 */
router.put("/:id", isAuthenticated, async (req, res, next) => {
  try {
    const parsedParams = presetEntryIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return sendValidationError(
        res,
        "Invalid grouped workout id.",
        parsedParams.error,
      );
    }

    const parsedBody = updatePresetSessionRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return sendValidationError(
        res,
        "Invalid grouped workout update payload.",
        parsedBody.error,
      );
    }

    const groupedWorkout = await exerciseService.updateGroupedWorkoutSession(
      req.userId,
      req.originalUserId || req.userId,
      parsedParams.data.id,
      parsedBody.data,
    );

    const response = presetSessionResponseSchema.parse(groupedWorkout);
    res.status(200).json(response);
  } catch (error) {
    log("error", `Error updating grouped workout session ${req.params.id}:`, error);
    handleRouteError(error, res, next);
  }
});

/**
 * @swagger
 * /exercise-preset-entries/{id}:
 *   delete:
 *     summary: Delete a grouped workout session
 *     tags: [Fitness & Workouts]
 *     description: Deletes a grouped workout session and cascades to its child exercise entries.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       204:
 *         description: Grouped workout session deleted successfully.
 *       400:
 *         description: Invalid grouped workout ID.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Grouped workout session not found.
 */
router.delete("/:id", isAuthenticated, async (req, res, next) => {
  try {
    const parsedParams = presetEntryIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return sendValidationError(
        res,
        "Invalid grouped workout id.",
        parsedParams.error,
      );
    }

    const deleted = await exercisePresetEntryRepository.deleteExercisePresetEntry(
      parsedParams.data.id,
      req.userId,
    );
    if (!deleted) {
      return res
        .status(404)
        .json({ message: "Exercise preset entry not found or not authorized." });
    }

    res.status(204).send();
  } catch (error) {
    log("error", `Error deleting grouped workout session ${req.params.id}:`, error);
    next(error);
  }
});

module.exports = router;
