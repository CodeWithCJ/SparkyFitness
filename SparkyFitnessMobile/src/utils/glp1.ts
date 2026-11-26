import {
  GLP1_CHECKIN_CATEGORY_NAMES,
  GLP1_DRUG_PROFILES,
  INJECTION_SITES,
} from '@workspace/shared';
import type {
  Glp1CheckInMetricKey,
  InjectionSite,
  MedicationPen,
} from '@workspace/shared';

export type { Glp1CheckInMetricKey };

/**
 * `categoryName` is the stable identifier shared with the web GLP-1 check-in
 * (`GLP1_CHECKIN_CATEGORY_NAMES`), so it must not be localized or renamed.
 */
export const GLP1_CHECKIN_METRICS: {
  key: Glp1CheckInMetricKey;
  categoryName: string;
  defaultLabel: string;
}[] = [
  {
    key: 'hunger',
    categoryName: GLP1_CHECKIN_CATEGORY_NAMES.hunger,
    defaultLabel: 'Hunger',
  },
  {
    key: 'food_noise',
    categoryName: GLP1_CHECKIN_CATEGORY_NAMES.food_noise,
    defaultLabel: 'Food noise',
  },
  {
    key: 'fullness',
    categoryName: GLP1_CHECKIN_CATEGORY_NAMES.fullness,
    defaultLabel: 'Fullness',
  },
  {
    key: 'energy',
    categoryName: GLP1_CHECKIN_CATEGORY_NAMES.energy,
    defaultLabel: 'Energy',
  },
];

export const GLP1_CHECKIN_DEFAULT = 5;

/** The selectable sites in the user's rotation order; `unknown` is not drawable. */
export function resolveMapSites(
  activeSiteIds: string[] | null | undefined
): InjectionSite[] {
  const drawable = INJECTION_SITES.filter((s) => s.id !== 'unknown');
  if (!activeSiteIds || activeSiteIds.length === 0) return drawable;
  const order = new Map(activeSiteIds.map((id, i) => [id, i] as const));
  return drawable
    .filter((s) => order.has(s.id))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export function penDosesLeft(pen: MedicationPen): number | null {
  return pen.doses_total == null
    ? null
    : Math.max(0, pen.doses_total - pen.doses_used);
}

export type PenExpiryStatus = 'expired' | 'soon' | 'ok';

/** Both arguments are 'YYYY-MM-DD' calendar days; compared as days, not instants. */
export function penExpiryStatus(
  expiryDate: string | null,
  today: string
): PenExpiryStatus | null {
  if (!expiryDate) return null;
  const days =
    (Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  if (Number.isNaN(days)) return null;
  if (days < 0) return 'expired';
  return days <= 7 ? 'soon' : 'ok';
}

/** Pens that can still take a dose, in-use first (matches the server's auto-pick). */
export function usablePens(pens: MedicationPen[]): MedicationPen[] {
  return pens
    .filter((p) => p.status !== 'finished')
    .sort(
      (a, b) => Number(b.status === 'in_use') - Number(a.status === 'in_use')
    );
}

export interface Glp1FormDefaults {
  name: string;
  typeId: 'injection' | 'tablet';
  strengthUnit: string;
  doseUnit: string;
}

/**
 * Medication form values implied by a GLP-1 drug choice. Oral semaglutide is a
 * daily tablet; every other profile is a pen or vial injection.
 */
export function glp1FormDefaults(drugId: string): Glp1FormDefaults | null {
  const profile = GLP1_DRUG_PROFILES[drugId];
  if (!profile) return null;
  const oral = drugId === 'oral_semaglutide';
  return {
    name: profile.displayName,
    typeId: oral ? 'tablet' : 'injection',
    strengthUnit: 'mg',
    doseUnit: 'mg',
  };
}

/** True when `name` is empty or is one of the names {@link glp1FormDefaults} produces. */
export function isAutofilledGlp1Name(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed === '' ||
    Object.keys(GLP1_DRUG_PROFILES).some(
      (id) => glp1FormDefaults(id)?.name === trimmed
    )
  );
}
