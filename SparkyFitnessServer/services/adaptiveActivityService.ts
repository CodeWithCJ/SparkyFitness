import {
  addDays,
  resolveBackgroundStepCalories,
  resolveExerciseCalories,
} from '@workspace/shared';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';

interface ActivityCheckIn {
  entry_date: string | Date;
  steps?: string | number | null;
  weight?: string | number | null;
  height?: string | number | null;
}

/** Resolves historical activity with the same device/workout/step policy as the diary. */
export async function getAdaptiveActivityCalories(
  userId: string,
  startDate: string,
  endDate: string,
  measurements: readonly ActivityCheckIn[],
  includeCheckin = true
): Promise<Map<string, number>> {
  const [splits, seed, fallback] = await Promise.all([
    exerciseEntryRepository.getDailyExerciseCalorieSplitRange(
      userId,
      startDate,
      endDate
    ),
    includeCheckin
      ? measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
          userId,
          startDate
        )
      : null,
    includeCheckin
      ? measurementRepository.getLatestWeightHeight(userId, startDate)
      : { weightKg: null, heightCm: null },
  ]);
  const splitByDate = new Map(splits.map((row) => [row.entry_date, row]));
  const rows = measurements
    .map((row) => ({ ...row, day: String(row.entry_date).slice(0, 10) }))
    .sort((a, b) => a.day.localeCompare(b.day));
  const stepsByDate = new Map(
    rows.map((row) => [row.day, Number(row.steps) || 0])
  );
  let weight = Number(seed?.weight) || Number(fallback.weightKg);
  let height = Number(seed?.height) || Number(fallback.heightCm);
  let cursor = 0;
  const result = new Map<string, number>();
  for (let day = startDate; day <= endDate; day = addDays(day, 1)) {
    while (cursor < rows.length && rows[cursor].day <= day) {
      const row = rows[cursor++];
      if (Number(row.weight) > 0) weight = Number(row.weight);
      if (Number(row.height) > 0) height = Number(row.height);
    }
    const split = splitByDate.get(day);
    const stepCalories = includeCheckin
      ? resolveBackgroundStepCalories({
          totalSteps: stepsByDate.get(day) ?? 0,
          activitySteps: Number(split?.activity_steps) || 0,
          weightKg: weight,
          heightCm: height,
        })
      : 0;
    result.set(
      day,
      resolveExerciseCalories(
        Number(split?.other_calories) || 0,
        Number(split?.active_calories) || 0,
        stepCalories
      ).calories
    );
  }
  return result;
}
