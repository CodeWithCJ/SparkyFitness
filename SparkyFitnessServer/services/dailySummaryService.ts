const goalService = require('./goalService');
const foodEntryService = require('./foodEntryService');
import { getExerciseEntriesByDateV2 } from './exerciseEntryHistoryService';
const measurementRepository = require('../models/measurementRepository');
const { log } = require('../config/logging');
import type { ExerciseSessionResponse } from '@workspace/shared';

interface DailySummaryOptions {
  actorUserId: string;
  targetUserId: string;
  date: string;
  includeCheckin: boolean;
}

export async function getDailySummary({
  actorUserId,
  targetUserId,
  date,
  includeCheckin,
}: DailySummaryOptions) {
  // Each function acquires its own pool client, allowing true parallel execution.
  const [goals, foodEntries, exerciseSessions, waterResult] = await Promise.all(
    [
      goalService.getUserGoals(targetUserId, date),
      foodEntryService.getFoodEntriesByDate(actorUserId, targetUserId, date),
      getExerciseEntriesByDateV2(targetUserId, date),
      includeCheckin
        ? measurementRepository
            .getWaterIntakeByDate(targetUserId, date)
            .catch((error: unknown) => {
              log(
                'warn',
                `Water intake fetch failed for user ${targetUserId} on ${date}, defaulting to 0:`,
                error
              );
              return null;
            })
        : null,
    ]
  );

  const stepCalories = includeCheckin
    ? await measurementRepository.getStepCaloriesForDate(
        targetUserId,
        date,
        exerciseSessions as ExerciseSessionResponse[]
      )
    : 0;

  return {
    goals,
    foodEntries,
    exerciseSessions,
    waterIntake: parseFloat(waterResult?.water_ml) || 0,
    stepCalories,
  };
}
