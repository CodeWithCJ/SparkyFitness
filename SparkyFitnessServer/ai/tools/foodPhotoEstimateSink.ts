import type { FoodPhotoEstimateResponse } from '@workspace/shared';

/**
 * Carries a structured photo estimate from the vision tool to the end of the
 * chat turn, so it can be persisted alongside the assistant message.
 *
 * The vision tool returns markdown for the model to read. Without this, the
 * numbers would only exist as prose, and logging them would mean the model
 * retyping every value into a single-food tool — losing the per-ingredient
 * structure and all the database matching along the way.
 *
 * Deliberately per-turn and passed in, not module state: two users' turns run
 * concurrently in the same process.
 */
export const FOOD_PHOTO_ESTIMATE_PART_TYPE = 'data-food-photo-estimate';

export interface FoodPhotoEstimateCapture {
  estimate: FoodPhotoEstimateResponse;
  capturedAt: string;
}

export interface FoodPhotoEstimateSink {
  set(estimate: FoodPhotoEstimateResponse): void;
  get(): FoodPhotoEstimateCapture | null;
}

export function createFoodPhotoEstimateSink(): FoodPhotoEstimateSink {
  let captured: FoodPhotoEstimateCapture | null = null;
  return {
    set(estimate) {
      // Last one wins: a turn that analyses twice should log what it showed last.
      captured = { estimate, capturedAt: new Date().toISOString() };
    },
    get() {
      return captured;
    },
  };
}
