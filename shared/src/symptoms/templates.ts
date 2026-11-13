import type {
  SymptomOptionKind,
  SymptomSection,
  SymptomTemplate,
} from './constants.ts';

type SectionMap = Record<SymptomSection, boolean>;

const off = (): SectionMap => ({
  timing: false,
  severity: false,
  locations: false,
  phases: false,
  qualities: false,
  associated: false,
  triggers: false,
  treatments: false,
  impact: false,
  notes: false,
  medication: false,
  bristol: false,
  photos: false,
  custom_fields: false,
});

// Every template always offers timing, severity, notes and any custom fields;
// the rest is what makes one template different from another.
const base = (extra: Partial<SectionMap>): SectionMap => ({
  ...off(),
  timing: true,
  severity: true,
  notes: true,
  custom_fields: true,
  ...extra,
});

export const TEMPLATE_SECTIONS: Record<SymptomTemplate, SectionMap> = {
  generic: base({ triggers: true, treatments: true, medication: true }),
  headache: base({
    locations: true,
    phases: true,
    qualities: true,
    associated: true,
    triggers: true,
    treatments: true,
    impact: true,
  }),
  pain: base({
    locations: true,
    qualities: true,
    triggers: true,
    treatments: true,
    impact: true,
    photos: true,
  }),
  gi: base({
    associated: true,
    triggers: true,
    treatments: true,
    medication: true,
    bristol: true,
  }),
  respiratory: base({
    associated: true,
    triggers: true,
    treatments: true,
  }),
  skin: base({
    locations: true,
    qualities: true,
    triggers: true,
    treatments: true,
    photos: true,
  }),
  mental: base({
    associated: true,
    triggers: true,
    treatments: true,
    impact: true,
  }),
};

/** Which pick-list the "locations" section reads from for a template. */
export const TEMPLATE_LOCATION_KIND: Record<
  SymptomTemplate,
  Extract<SymptomOptionKind, 'location' | 'head_location'>
> = {
  generic: 'location',
  headache: 'head_location',
  pain: 'location',
  gi: 'location',
  respiratory: 'location',
  skin: 'location',
  mental: 'location',
};

/**
 * The sections a symptom shows: its template's defaults with any per-symptom
 * overrides (`user_custom_symptoms.sections`) applied on top. Unknown keys in
 * `overrides` are ignored.
 */
export function resolveSections(
  template: string | null | undefined,
  overrides?: unknown
): SectionMap {
  const known = (template ?? 'generic') as SymptomTemplate;
  const resolved = {
    ...(TEMPLATE_SECTIONS[known] ?? TEMPLATE_SECTIONS.generic),
  };
  if (overrides && typeof overrides === 'object') {
    for (const key of Object.keys(resolved) as SymptomSection[]) {
      const value = (overrides as Record<string, unknown>)[key];
      if (typeof value === 'boolean') resolved[key] = value;
    }
  }
  return resolved;
}
