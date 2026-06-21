/**
 * Fasting protocols and metabolic-stage definitions for the mobile fasting feature.
 *
 * Ported from the web app's `src/constants/fastingPresets.ts`. The server stores the
 * preset `name` in `fasting_type` and treats it as an opaque display string — goal
 * hours and progress always come from `target_end_time − start_time`, never from the
 * preset. Preset ids are NOT persisted (only `name` is), so the legacy `'circumadian'`
 * typo is kept verbatim to avoid any id-based mismatch with the web client.
 */

export interface FastingPreset {
  id: string;
  name: string;
  fastingHours: number;
  eatingHours: number;
  description: string;
}

export const FASTING_PRESETS: FastingPreset[] = [
  {
    id: '16-8',
    name: '16:8 Leangains',
    fastingHours: 16,
    eatingHours: 8,
    description: 'Skip breakfast and eat during an 8-hour window.',
  },
  {
    id: '18-6',
    name: '18:6 Warrior',
    fastingHours: 18,
    eatingHours: 6,
    description: 'More aggressive fast with a 6-hour eating window.',
  },
  {
    id: '20-4',
    name: '20:4 Warrior',
    fastingHours: 20,
    eatingHours: 4,
    description: 'Eat one large meal or spread calories over 4 hours.',
  },
  {
    id: 'circumadian',
    name: 'Circadian Rhythm',
    fastingHours: 13,
    eatingHours: 11,
    description: 'Fast from sunset to morning.',
  },
  {
    id: 'custom',
    name: 'Custom Fast',
    fastingHours: 12,
    eatingHours: 12,
    description: 'Set your own fasting duration.',
  },
];

export const DEFAULT_PRESET_ID = '16-8';

export const CUSTOM_PRESET_ID = 'custom';

/**
 * A metabolic stage of a fast, keyed by elapsed hours. Boundaries are fixed and
 * protocol-independent. `colorVar` holds a theme CSS-variable *name* (never a hex)
 * so components resolve it with `useCSSVariable` and it tracks Light/Dark/AMOLED.
 */
export interface MetabolicStage {
  key: string;
  name: string;
  /** Lower bound (inclusive), in elapsed hours. */
  minHours: number;
  /** Upper bound (exclusive), in elapsed hours. `null` for the final open-ended stage. */
  maxHours: number | null;
  /** Theme CSS-variable name resolved via `useCSSVariable`. */
  colorVar: string;
  /** Short range label for the stages list, e.g. "4–16h" or "72h+". */
  rangeLabel: string;
  /** Static, protocol-independent description copy. */
  description: string;
}

export const METABOLIC_STAGES: MetabolicStage[] = [
  {
    key: 'anabolic',
    name: 'Anabolic',
    minHours: 0,
    maxHours: 4,
    colorVar: '--color-accent-primary',
    rangeLabel: '0–4h',
    description: 'Fed state · insulin elevated',
  },
  {
    key: 'catabolic',
    name: 'Catabolic',
    minHours: 4,
    maxHours: 16,
    colorVar: '--color-cat-orange',
    rangeLabel: '4–16h',
    description: 'Glycogen depleting · fat metabolism ramping up',
  },
  {
    key: 'fat-burning',
    name: 'Fat burning',
    minHours: 16,
    maxHours: 24,
    colorVar: '--color-cat-pink',
    rangeLabel: '16–24h',
    // Neutral copy on purpose: fat burning is fixed at 16h, but the *goal* varies
    // by protocol, so the mockup's "Starts at your 16h goal" would be wrong for
    // 18:6 / 20:4 / Custom.
    description: 'Fat burning ramps up',
  },
  {
    key: 'ketosis',
    name: 'Ketosis',
    minHours: 24,
    maxHours: 72,
    colorVar: '--color-cat-violet',
    rangeLabel: '24–72h',
    description: 'Ketone production rises',
  },
  {
    key: 'deep-ketosis',
    name: 'Deep ketosis',
    minHours: 72,
    maxHours: null,
    colorVar: '--color-calories',
    rangeLabel: '72h+',
    description: 'Autophagy peak',
  },
];

/**
 * Resolves the current metabolic stage for a given elapsed-hours value. Lower
 * bounds are inclusive, so exactly 4h is "Catabolic", exactly 16h is "Fat
 * burning", etc. Negative / non-finite input clamps to the first stage.
 */
export function getMetabolicStage(hours: number): MetabolicStage {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  for (let i = METABOLIC_STAGES.length - 1; i >= 0; i--) {
    if (h >= METABOLIC_STAGES[i].minHours) {
      return METABOLIC_STAGES[i];
    }
  }
  return METABOLIC_STAGES[0];
}

/** Index of a stage within `METABOLIC_STAGES` (useful for resolving its color). */
export function getMetabolicStageIndex(stage: MetabolicStage): number {
  return METABOLIC_STAGES.findIndex((s) => s.key === stage.key);
}

/**
 * Display-only, tolerant label for a fast's `fasting_type`. Extracts a "16:8"
 * ratio when present; otherwise falls back to the raw string (covers "Custom
 * Fast", "Circadian Rhythm", and arbitrary web-started strings), or a neutral
 * "Fasting" when null/empty.
 *
 * MUST NOT feed goal/progress math — that always derives from the timestamps.
 */
export function protocolBadgeLabel(fastingType: string | null | undefined): string {
  if (!fastingType || !fastingType.trim()) return 'Fasting';
  const ratio = fastingType.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (ratio) return `${ratio[1]}:${ratio[2]}`;
  return fastingType.trim();
}
