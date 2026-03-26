const goalService = require("./goalService");
const foodEntryService = require("./foodEntryService");
import { getExerciseEntriesByDateV2 } from "./exerciseEntryHistoryService";
const measurementRepository = require("../models/measurementRepository");
const { log } = require("../config/logging");

interface DailySummaryOptions {
  actorUserId: string;
  targetUserId: string;
  date: string;
  includeWater: boolean;
}

export async function getDailySummary({ actorUserId, targetUserId, date, includeWater }: DailySummaryOptions) {
  // Each function acquires its own pool client, allowing true parallel execution.
  // This uses ~4 connections per request. For a self-hosted server with minimal
  // concurrent users this is fine and faster than serializing through one client.
  const [goals, foodEntries, exerciseSessions, waterResult] = await Promise.all([
    goalService.getUserGoals(targetUserId, date),
    foodEntryService.getFoodEntriesByDate(actorUserId, targetUserId, date),
    getExerciseEntriesByDateV2(targetUserId, date),
    includeWater
      ? measurementRepository.getWaterIntakeByDate(targetUserId, date).catch((error: unknown) => {
          log("warn", `Water intake fetch failed for user ${targetUserId} on ${date}, defaulting to 0:`, error);
          return null;
        })
      : null,
  ]);

  return {
    goals,
    foodEntries,
    exerciseSessions,
    waterIntake: parseFloat(waterResult?.water_ml) || 0,
  };
}
