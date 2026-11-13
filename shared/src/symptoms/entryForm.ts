import type {
  CreateSymptomEntryBody,
  SymptomEntryResponse,
  SymptomTreatmentInput,
} from '../schemas/api/Symptoms.api.zod.ts';
import type { SymptomImpact, TreatmentEffectiveness } from './constants.ts';
import { scaleMax, severityBand, type SymptomChoice } from './choices.ts';

/** A treatment being edited in a form, before it is saved with the entry. */
export interface TreatmentDraft {
  key: string;
  kind: 'medication' | 'relief';
  name: string;
  medicationId: string | null;
  dose: string | null;
  takenAt: string | null;
  effectiveness: TreatmentEffectiveness | null;
}

export const draftsFromEntry = (
  entry: Pick<SymptomEntryResponse, 'treatments'>
): TreatmentDraft[] =>
  entry.treatments.map((tr) => ({
    key: tr.id,
    kind: tr.kind,
    name: tr.name_snapshot,
    medicationId: tr.medication_id,
    dose: tr.dose_snapshot,
    takenAt: tr.taken_at,
    effectiveness: tr.effectiveness,
  }));

export const draftsToInputs = (
  drafts: TreatmentDraft[]
): SymptomTreatmentInput[] =>
  drafts.map((tr) => ({
    kind: tr.kind,
    medication_id: tr.medicationId,
    name_snapshot: tr.name,
    dose_snapshot: tr.dose,
    taken_at: tr.takenAt,
    effectiveness: tr.effectiveness,
  }));

export const reliefDraft = (name: string, now: Date): TreatmentDraft => ({
  key: `relief-${name}`,
  kind: 'relief',
  name,
  medicationId: null,
  dose: null,
  takenAt: now.toISOString(),
  effectiveness: null,
});

/** Everything a person can fill in on the symptom log form. */
export interface SymptomFormState {
  mode: 'quick' | 'episode';
  /** ISO instant an episode began. */
  startedAt: string;
  ongoing: boolean;
  /** ISO instant an episode ended; only sent when it is not ongoing. */
  endedAt: string;
  severity: number | null;
  locations: string[];
  phases: Record<string, string[]>;
  qualities: string[];
  associated: string[];
  triggers: string[];
  impact: SymptomImpact | null;
  bristol: number | null;
  medicationId: string | null;
  notes: string;
  customFields: Record<string, unknown>;
  treatments: TreatmentDraft[];
}

/**
 * The request body for saving the form.
 *
 * A quick log belongs to the chosen calendar day, at the current time when that
 * day is today and at midday otherwise. An episode carries its own start (and
 * end, unless it is still going) and lets the server work out the day. When an
 * edit turns an episode back into a quick log, its times are cleared.
 *
 * A severity that was never touched is sent as the middle of the scale, so the
 * slider the person saw and the value stored agree.
 */
export function buildEntryBody(input: {
  state: SymptomFormState;
  choice: SymptomChoice;
  /** The saved definition's id, once the symptom has one. */
  symptomId: string | null;
  selectedDate: string;
  today: string;
  isEdit: boolean;
  now?: Date;
}): CreateSymptomEntryBody {
  const { state, choice, symptomId, selectedDate, today, isEdit } = input;
  const now = input.now ?? new Date();

  const max = scaleMax(choice.scaleType);
  const severity =
    choice.scaleType === 'text'
      ? null
      : (state.severity ??
        (choice.scaleType === 'count' ? null : Math.ceil(max / 2)));
  const band =
    severity != null ? severityBand(severity, choice.scaleType) : null;

  const body: CreateSymptomEntryBody = {
    symptom_id: symptomId,
    symptom_name_snapshot: choice.displayName,
    severity,
    severity_label:
      band === 'low'
        ? 'Mild'
        : band === 'mid'
          ? 'Moderate'
          : band
            ? 'Severe'
            : null,
    body_locations: state.locations,
    qualities: state.qualities,
    associated_symptoms: state.associated,
    triggers: state.triggers,
    phases: Object.fromEntries(
      Object.entries(state.phases).filter(([, v]) => v.length > 0)
    ),
    impact: state.impact,
    context_text: state.notes.trim() || null,
    bristol_type: choice.sections.bristol ? state.bristol : null,
    medication_id: state.medicationId,
    custom_fields: state.customFields,
    treatments: draftsToInputs(state.treatments),
  };

  if (state.mode === 'episode') {
    body.started_at = state.startedAt;
    body.ended_at = state.ongoing ? null : state.endedAt;
  } else {
    body.entry_date = selectedDate;
    body.logged_at =
      selectedDate === today
        ? now.toISOString()
        : new Date(`${selectedDate}T12:00:00`).toISOString();
    if (isEdit) {
      body.started_at = null;
      body.ended_at = null;
    }
  }
  return body;
}
