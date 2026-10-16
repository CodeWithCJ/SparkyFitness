import type { NutrientGoalType } from '../services/api/nutrientGoalPreferencesApi';

/** Dot/accent color per goal direction, shared by the guide legend and the Min/Max/Range selectors. */
export const DIRECTION_COLORS: Record<NutrientGoalType, string> = {
  minimum: '#9ca3af',
  maximum: '#f59e0b',
  target: '#3b82f6',
};

export type NutrientDirectionGuideKey =
  'loseWeight' | 'gainWeight' | 'maintain' | 'diabetes' | 'heart' | 'lowCarb';

export interface NutrientDirectionGuide {
  key: NutrientDirectionGuideKey;
  /** Direction each listed nutrient should take when the guide is applied. */
  directions: Record<string, NutrientGoalType>;
}

/** Share of the calorie goal used either side of it for the "maintain" range. */
export const MAINTAIN_RANGE_FRACTION = 0.1;

// Copy lives in the component so each string has a static i18n key. Mirrors the web "Not sure which to choose?" guidance for goal directions.
export const NUTRIENT_DIRECTION_GUIDES: NutrientDirectionGuide[] = [
  {
    key: 'loseWeight',
    directions: { calories: 'maximum' },
  },
  {
    key: 'gainWeight',
    directions: { calories: 'minimum', protein: 'minimum' },
  },
  {
    key: 'maintain',
    directions: { calories: 'target' },
  },
  {
    key: 'diabetes',
    directions: { carbs: 'maximum', sugars: 'maximum' },
  },
  {
    key: 'heart',
    directions: {
      cholesterol: 'maximum',
      saturated_fat: 'maximum',
      sodium: 'maximum',
    },
  },
  {
    key: 'lowCarb',
    directions: { carbs: 'maximum', fat: 'minimum', protein: 'minimum' },
  },
];

export interface GuideDirectionDraft {
  goalType: NutrientGoalType;
  min: string;
  max: string;
}

/**
 * Directions a guide would set. Only nutrients present in `current` are
 * touched, and a `target` direction gets a band around `calories` so the range
 * is valid without further typing.
 */
export const buildGuideDirections = (
  guide: NutrientDirectionGuide,
  current: Record<string, GuideDirectionDraft>,
  calories: number
): Record<string, GuideDirectionDraft> => {
  const next: Record<string, GuideDirectionDraft> = {};
  for (const [field, goalType] of Object.entries(guide.directions)) {
    const existing = current[field];
    if (!existing) continue;
    if (goalType === 'target') {
      const base = Number.isFinite(calories) ? calories : 0;
      next[field] = {
        goalType,
        min: String(Math.round(base * (1 - MAINTAIN_RANGE_FRACTION))),
        max: String(Math.round(base * (1 + MAINTAIN_RANGE_FRACTION))),
      };
    } else {
      next[field] = { ...existing, goalType };
    }
  }
  return next;
};
