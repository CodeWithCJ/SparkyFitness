import { addDays, buildTrainingReview, todayInZone } from '@workspace/shared';
import type { ReviewEntry, TrainingReview } from '@workspace/shared';
import reportRepository from '../models/reportRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** How far back stalls and the "untrained muscles" check look beyond the window. */
const LOOKBACK_DAYS = 84;

export const DEFAULT_TRAINING_REVIEW_WINDOW_DAYS = 28;

/**
 * Reads recent strength training for the AI assistant: sessions, lifts that
 * have stopped moving, effort and muscle coverage. The numbers are computed
 * here, not by the model, so the assistant only has to interpret them.
 */
async function getTrainingReview(
  userId: string,
  windowDays: number = DEFAULT_TRAINING_REVIEW_WINDOW_DAYS
): Promise<TrainingReview> {
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const entries = (await reportRepository.getExerciseEntries(
    userId,
    addDays(today, -Math.max(LOOKBACK_DAYS, windowDays)),
    today
  )) as ReviewEntry[];
  return buildTrainingReview(entries, today, windowDays);
}

export { getTrainingReview };
export default { getTrainingReview };
