import { tool } from 'ai';
import {
  bacInDisplayUnit,
  todayInZone,
  type BacBodyInput,
  type BacDisplayUnit,
  type BloodAlcoholResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getBloodAlcoholEstimate } from '../../services/bloodAlcoholService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatJsonResult } from './formatting.js';
import { normalizeActionArgs, withLocalDateTime } from './dates.js';
import {
  BLOOD_ALCOHOL_ACTIONS,
  bloodAlcoholSchema,
  bloodAlcoholInput,
  type BloodAlcoholInput,
} from './schemas/bloodAlcohol.js';

const VALID_ACTIONS = [...BLOOD_ALCOHOL_ACTIONS];

export const BLOOD_ALCOHOL_DISCLAIMER =
  'Rough estimate only: the real value can differ by 20% or more. Never use it to judge whether someone is fit to drive.';

const WHERE_TO_SET: Record<BacBodyInput, string> = {
  sex: 'sex: Settings > Profile',
  weight: 'weight: Check-In',
  height: 'height: Check-In',
  age: 'date of birth: Settings > Profile',
};

const FORMULA_FALLBACK_NOTE =
  'The chosen formula did not fit the body measurements, so Watson was used instead.';

const inUnit = (permille: number, unit: BacDisplayUnit): number =>
  Number(bacInDisplayUnit(permille, unit).toFixed(4));

// Deliberately no time the estimate returns to zero, and no elimination rate
// that would let a model derive one: it would present it as "sober at" or
// "safe to drive at", which the estimate must never answer.
function toChatResult(data: BloodAlcoholResponse, tz: string, date: string) {
  const unit = data.display_unit;
  const doses = data.doses.map((dose) => withLocalDateTime(dose, tz));
  return {
    disclaimer: BLOOD_ALCOHOL_DISCLAIMER,
    status: data.status,
    missing_inputs: data.missing_inputs,
    where_to_set: data.missing_inputs.map((input) => WHERE_TO_SET[input]),
    unit,
    estimated_now:
      data.estimated_now_permille === null
        ? null
        : inUnit(data.estimated_now_permille, unit),
    peak: data.peak
      ? withLocalDateTime(
          { at: data.peak.at, value: inUnit(data.peak.permille, unit) },
          tz
        )
      : null,
    total_alcohol_g_for_date: Number(
      doses
        .filter((dose) => dose.date === date)
        .reduce((sum, dose) => sum + dose.grams, 0)
        .toFixed(1)
    ),
    doses,
    has_estimated_times: data.has_estimated_times,
    formula: data.formula,
    ...(data.fell_back_from
      ? {
          fell_back_from: data.fell_back_from,
          formula_note: FORMULA_FALLBACK_NOTE,
        }
      : {}),
  };
}

export function buildBloodAlcoholTools(userId: string, tz: string) {
  return {
    sparky_get_blood_alcohol: tool({
      description:
        "Estimates the user's blood alcohol (Widmark model) from the drinks logged with alcohol, their profile (sex, weight, height, age) and their preferences (bac_distribution_formula, bac_elimination_rate, bac_display_unit). Defaults to today. Read-only. Values are in `unit` (permille or percent). estimated_now is null unless the date is today; peak is the day's highest estimate. Always repeat `disclaimer` to the user. Never say or work out when the user will be sober, back to zero, or able to drive, and never advise on driving. When status is missing_inputs, tell the user what is missing and where to set it (where_to_set); do not guess the values. When status is implausible_inputs, ask them to check their weight and height. When formula_note is present, tell the user their chosen formula (fell_back_from) did not fit their body measurements and Watson was used. Every date/time (doses[].date/time, peak.date/time) is already in the user's local timezone; use them as given. doses can include drinks from the evening before that still count; state each dose's date.",
      inputSchema: bloodAlcoholInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'estimate'
        );
        const parsed = bloodAlcoholSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: BloodAlcoholInput = parsed.data;
        try {
          switch (args.action) {
            case 'estimate': {
              const date = args.date ?? todayInZone(tz);
              const data = await getBloodAlcoholEstimate(userId, { date });
              return formatJsonResult(toChatResult(data, tz, date));
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as BloodAlcoholInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Blood Alcohol Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
