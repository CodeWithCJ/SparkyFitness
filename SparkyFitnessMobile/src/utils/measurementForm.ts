import type { CheckInMeasurement } from '../types/measurements';
import {
  cmToFeetInches,
  feetInchesToCm,
  kgToStonesLbs,
  lengthFromCm,
  lengthToCm,
  stonesLbsToKg,
  weightFromKg,
  weightToKg,
} from './unitConversions';
import { parseDecimalInput } from './numericInput';

/**
 * Pure form model for the measurements editor.
 *
 * The screen used to own these types and the measurement -> form conversion
 * inline. They live here so the previous-value hints can reuse the exact same
 * conversion: a hint is by definition what the field would hold if that
 * measurement had been recorded on the selected day, and deriving it any other
 * way would let the suggestion drift from the real prefill.
 */

export type FieldKey =
  | 'weight'
  | 'neck'
  | 'waist'
  | 'hips'
  | 'steps'
  | 'height'
  | 'bodyFatPercentage'
  | 'muscleMassKg'
  | 'boneMassKg'
  | 'bodyWaterPercentage'
  | 'bmr';

export type FormState = Record<FieldKey, string> & {
  heightFeet: string;
  weightStones: string;
};

export const EMPTY_FORM: FormState = {
  weight: '',
  neck: '',
  waist: '',
  hips: '',
  steps: '',
  height: '',
  heightFeet: '',
  weightStones: '',
  bodyFatPercentage: '',
  muscleMassKg: '',
  boneMassKg: '',
  bodyWaterPercentage: '',
  bmr: '',
};

/**
 * Form inputs a field owns, primary first. A field renders as two inputs for
 * stones+lbs (weight) and feet+inches (height), so adopting or clearing a value
 * has to move both keys together.
 */
export const FIELD_FORM_KEYS: Record<FieldKey, (keyof FormState)[]> = {
  weight: ['weight', 'weightStones'],
  neck: ['neck'],
  waist: ['waist'],
  hips: ['hips'],
  steps: ['steps'],
  height: ['height', 'heightFeet'],
  bodyFatPercentage: ['bodyFatPercentage'],
  muscleMassKg: ['muscleMassKg'],
  boneMassKg: ['boneMassKg'],
  bodyWaterPercentage: ['bodyWaterPercentage'],
  bmr: ['bmr'],
};

export const FORM_FIELD_KEYS: Record<keyof FormState, FieldKey> = {
  weight: 'weight',
  weightStones: 'weight',
  neck: 'neck',
  waist: 'waist',
  hips: 'hips',
  steps: 'steps',
  height: 'height',
  heightFeet: 'height',
  bodyFatPercentage: 'bodyFatPercentage',
  muscleMassKg: 'muscleMassKg',
  boneMassKg: 'boneMassKg',
  bodyWaterPercentage: 'bodyWaterPercentage',
  bmr: 'bmr',
};

export interface MeasurementUnitModes {
  /** Weight supports a third "stones + lbs" mode that renders two inputs. */
  weightMode: 'kg' | 'lbs' | 'st_lbs';
  /** Body measurements (waist/neck/hips) only support cm/inches. */
  bodyUnit: 'cm' | 'inches';
  /** Height supports a third "feet + inches" mode that renders two inputs. */
  heightMode: 'cm' | 'inches' | 'ft_in';
}

/** Round to 1 decimal place; trailing zeros are dropped by `String(...)`. */
export const formatNumberForInput = (value: number): string =>
  String(Math.round(value * 10) / 10);

/** Masses are stored in kg; st_lbs has no single-field representation. */
const massDisplayUnit = (weightMode: MeasurementUnitModes['weightMode']) =>
  weightMode === 'st_lbs' ? 'kg' : weightMode;

/**
 * Converts a stored (metric) measurement row into the form values it should
 * produce, plus the set of fields it actually populated.
 *
 * A field is only prefilled when its column is non-null, so an absent column
 * never looks like a recorded zero.
 */
export function buildStandardFormFromMeasurement(
  measurement: CheckInMeasurement | null | undefined,
  units: MeasurementUnitModes
): { values: Partial<FormState>; prefilled: Set<FieldKey> } {
  const values: Partial<FormState> = {};
  const prefilled = new Set<FieldKey>();
  if (!measurement) return { values, prefilled };

  const { weightMode, bodyUnit, heightMode } = units;

  if (measurement.weight != null) {
    if (weightMode === 'st_lbs') {
      const { stones, lbs } = kgToStonesLbs(measurement.weight);
      values.weightStones = String(stones);
      values.weight = formatNumberForInput(lbs);
    } else {
      values.weight = formatNumberForInput(
        weightFromKg(measurement.weight, weightMode)
      );
    }
    prefilled.add('weight');
  }
  if (measurement.neck != null) {
    values.neck = formatNumberForInput(
      lengthFromCm(measurement.neck, bodyUnit)
    );
    prefilled.add('neck');
  }
  if (measurement.waist != null) {
    values.waist = formatNumberForInput(
      lengthFromCm(measurement.waist, bodyUnit)
    );
    prefilled.add('waist');
  }
  if (measurement.hips != null) {
    values.hips = formatNumberForInput(
      lengthFromCm(measurement.hips, bodyUnit)
    );
    prefilled.add('hips');
  }
  if (measurement.height != null) {
    if (heightMode === 'ft_in') {
      const { feet, inches } = cmToFeetInches(measurement.height);
      values.heightFeet = String(feet);
      values.height = formatNumberForInput(inches);
    } else {
      values.height = formatNumberForInput(
        lengthFromCm(measurement.height, heightMode)
      );
    }
    prefilled.add('height');
  }
  if (measurement.steps != null) {
    values.steps = String(measurement.steps);
    prefilled.add('steps');
  }
  if (measurement.body_fat_percentage != null) {
    values.bodyFatPercentage = formatNumberForInput(
      measurement.body_fat_percentage
    );
    prefilled.add('bodyFatPercentage');
  }
  if (measurement.muscle_mass_kg != null) {
    values.muscleMassKg = formatNumberForInput(
      weightFromKg(measurement.muscle_mass_kg, massDisplayUnit(weightMode))
    );
    prefilled.add('muscleMassKg');
  }
  if (measurement.bone_mass_kg != null) {
    values.boneMassKg = formatNumberForInput(
      weightFromKg(measurement.bone_mass_kg, massDisplayUnit(weightMode))
    );
    prefilled.add('boneMassKg');
  }
  if (measurement.body_water_percentage != null) {
    values.bodyWaterPercentage = formatNumberForInput(
      measurement.body_water_percentage
    );
    prefilled.add('bodyWaterPercentage');
  }
  if (measurement.bmr != null) {
    values.bmr = formatNumberForInput(measurement.bmr);
    prefilled.add('bmr');
  }

  return { values, prefilled };
}

const parseOptional = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = parseDecimalInput(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * The stored (metric) value implied by the field's current form text, or null
 * when the field is blank or unparseable. Mirrors the save path so the Body Fat
 * calculator reads exactly what saving would write.
 */
export function standardFieldMetricValue(
  field: FieldKey,
  form: FormState,
  units: MeasurementUnitModes
): number | null {
  const { weightMode, bodyUnit, heightMode } = units;

  switch (field) {
    case 'weight': {
      if (weightMode === 'st_lbs') {
        const stones = parseOptional(form.weightStones) ?? 0;
        const lbs = parseOptional(form.weight) ?? 0;
        if (form.weightStones.trim() === '' && form.weight.trim() === '') {
          return null;
        }
        return stonesLbsToKg(stones, lbs);
      }
      const parsed = parseOptional(form.weight);
      return parsed == null ? null : weightToKg(parsed, weightMode);
    }
    case 'height': {
      if (heightMode === 'ft_in') {
        if (form.heightFeet.trim() === '' && form.height.trim() === '') {
          return null;
        }
        const feet = parseOptional(form.heightFeet) ?? 0;
        const inches = parseOptional(form.height) ?? 0;
        return feetInchesToCm(feet, inches);
      }
      const parsed = parseOptional(form.height);
      return parsed == null ? null : lengthToCm(parsed, heightMode);
    }
    case 'neck':
    case 'waist':
    case 'hips': {
      const parsed = parseOptional(form[field]);
      return parsed == null ? null : lengthToCm(parsed, bodyUnit);
    }
    case 'muscleMassKg':
    case 'boneMassKg': {
      const parsed = parseOptional(form[field]);
      return parsed == null
        ? null
        : weightToKg(parsed, massDisplayUnit(weightMode));
    }
    case 'steps':
    case 'bodyFatPercentage':
    case 'bodyWaterPercentage':
    case 'bmr':
      return parseOptional(form[field]);
    default:
      return null;
  }
}
