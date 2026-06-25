/**
 * GLP-1 domain helpers shared by the server (glp1Service) and the web client (PK chart,
 * site rotation). Pure functions + published reference data — no DB, no side effects.
 *
 * IMPORTANT: The serum-level curve is a simple one-compartment pharmacokinetic *model*
 * derived from published elimination half-lives. It is an estimate for visualization and
 * education only — it is NOT a measured blood level and must be labeled as such in the UI.
 */

export interface Glp1DrugProfile {
  /** stable id used in code / data */
  id: string;
  displayName: string;
  /** common brand names, for matching/labels */
  brands: string[];
  /** elimination half-life in days (published, approximate) */
  halfLifeDays: number;
  /** time to peak concentration in days (approximate) */
  tMaxDays: number;
  /** typical dosing cadence */
  cadence: 'weekly' | 'daily';
}

/**
 * Published, approximate pharmacokinetics. Values are rounded from label/literature and are
 * intended for modeling/illustration, not clinical dosing.
 */
export const GLP1_DRUG_PROFILES: Record<string, Glp1DrugProfile> = {
  semaglutide: {
    id: 'semaglutide',
    displayName: 'Semaglutide',
    brands: ['Ozempic', 'Wegovy'],
    halfLifeDays: 7,
    tMaxDays: 1.5,
    cadence: 'weekly',
  },
  oral_semaglutide: {
    id: 'oral_semaglutide',
    displayName: 'Semaglutide (oral)',
    brands: ['Rybelsus'],
    halfLifeDays: 7,
    tMaxDays: 1,
    cadence: 'daily',
  },
  tirzepatide: {
    id: 'tirzepatide',
    displayName: 'Tirzepatide',
    brands: ['Mounjaro', 'Zepbound'],
    halfLifeDays: 5,
    tMaxDays: 1.5,
    cadence: 'weekly',
  },
  dulaglutide: {
    id: 'dulaglutide',
    displayName: 'Dulaglutide',
    brands: ['Trulicity'],
    halfLifeDays: 4.7,
    tMaxDays: 2,
    cadence: 'weekly',
  },
  liraglutide: {
    id: 'liraglutide',
    displayName: 'Liraglutide',
    brands: ['Saxenda', 'Victoza'],
    halfLifeDays: 0.54, // ~13 hours
    tMaxDays: 0.46, // ~8-12 hours
    cadence: 'daily',
  },
};

/** Resolve a drug profile by id or (case-insensitive) brand name. */
export function resolveGlp1Profile(idOrBrand: string): Glp1DrugProfile | undefined {
  const key = idOrBrand.trim().toLowerCase();
  const byId = GLP1_DRUG_PROFILES[key];
  if (byId) return byId;
  return Object.values(GLP1_DRUG_PROFILES).find(
    (p) =>
      p.id.toLowerCase() === key ||
      p.brands.some((b) => b.toLowerCase() === key),
  );
}

/** First-order elimination rate constant (per day) from a half-life in days. */
export function eliminationRate(halfLifeDays: number): number {
  return Math.LN2 / halfLifeDays;
}

export interface DoseEvent {
  /** day index (can be fractional) when the dose was administered */
  day: number;
  /** dose amount in mg */
  doseMg: number;
}

/**
 * Relative serum level at `day` from superimposing one-compartment decay of each prior dose.
 * Includes a light first-order absorption term so the curve rises to tMax then falls, rather
 * than spiking instantly. Returns an unnormalized value (caller can scale to % of peak).
 */
export function serumLevelAt(
  day: number,
  doses: DoseEvent[],
  profile: Pick<Glp1DrugProfile, 'halfLifeDays' | 'tMaxDays'>,
): number {
  const ke = eliminationRate(profile.halfLifeDays);
  // Absorption rate: derived so the single-dose peak lands near tMax.
  const ka = profile.tMaxDays > 0 ? Math.max(ke * 1.5, Math.LN2 / profile.tMaxDays) : ke * 4;
  let level = 0;
  for (const d of doses) {
    const t = day - d.day;
    if (t < 0) continue;
    if (Math.abs(ka - ke) < 1e-6) {
      level += d.doseMg * ke * t * Math.exp(-ke * t);
    } else {
      // Bateman function (one-compartment, first-order absorption + elimination).
      level += (d.doseMg * ka) / (ka - ke) * (Math.exp(-ke * t) - Math.exp(-ka * t));
    }
  }
  return level;
}

export interface SerumPoint {
  day: number;
  level: number;
  /** level as a fraction (0-1) of the max level across the sampled window */
  fraction: number;
}

/**
 * Sample the modeled serum curve across [fromDay, toDay] at `stepDays`. The `fraction` field
 * is normalized to the peak within the sampled window, suitable for a 0-100% chart axis.
 */
export function simulateSerumCurve(
  doses: DoseEvent[],
  profile: Pick<Glp1DrugProfile, 'halfLifeDays' | 'tMaxDays'>,
  fromDay: number,
  toDay: number,
  stepDays = 0.25,
): SerumPoint[] {
  const raw: { day: number; level: number }[] = [];
  for (let day = fromDay; day <= toDay + 1e-9; day += stepDays) {
    raw.push({ day: Number(day.toFixed(4)), level: serumLevelAt(day, doses, profile) });
  }
  const peak = raw.reduce((m, p) => Math.max(m, p.level), 0) || 1;
  return raw.map((p) => ({ ...p, fraction: p.level / peak }));
}

/** Eight injection zones for subcutaneous GLP-1 rotation. */
export interface InjectionSite {
  id: string;
  label: string;
  region: 'abdomen' | 'thigh' | 'arm';
  side: 'left' | 'right';
}

export const INJECTION_SITES: InjectionSite[] = [
  { id: 'left_abdomen', label: 'Left abdomen', region: 'abdomen', side: 'left' },
  { id: 'right_abdomen', label: 'Right abdomen', region: 'abdomen', side: 'right' },
  { id: 'left_thigh', label: 'Left thigh', region: 'thigh', side: 'left' },
  { id: 'right_thigh', label: 'Right thigh', region: 'thigh', side: 'right' },
  { id: 'left_arm', label: 'Left upper arm', region: 'arm', side: 'left' },
  { id: 'right_arm', label: 'Right upper arm', region: 'arm', side: 'right' },
  { id: 'left_flank', label: 'Left flank', region: 'abdomen', side: 'left' },
  { id: 'right_flank', label: 'Right flank', region: 'abdomen', side: 'right' },
];

/** Minimum days a site should rest before reuse (lipohypertrophy guidance). */
export const SITE_REST_DAYS = 7;

export interface RecentSiteUse {
  siteId: string;
  /** whole or fractional days since this site was last used */
  daysAgo: number;
}

export interface SiteRotationResult {
  /** suggested next site id (the one rested longest / never used) */
  suggestedSiteId: string;
  /** site ids that are still within the rest window and should be avoided */
  restingSiteIds: string[];
}

/**
 * Suggest the next injection site: prefer sites never used, otherwise the one rested longest.
 * Flags any site used within SITE_REST_DAYS as resting (lipo warning).
 */
export function suggestNextSite(recent: RecentSiteUse[]): SiteRotationResult {
  const lastUsed = new Map<string, number>();
  for (const r of recent) {
    const prev = lastUsed.get(r.siteId);
    if (prev === undefined || r.daysAgo < prev) lastUsed.set(r.siteId, r.daysAgo);
  }
  const restingSiteIds = INJECTION_SITES.filter(
    (s) => (lastUsed.get(s.id) ?? Infinity) < SITE_REST_DAYS,
  ).map((s) => s.id);

  // Pick the site rested longest (or never used). Written as a reduce so it stays
  // safe under noUncheckedIndexedAccess (no array[0] that TS sees as possibly undefined).
  let best: InjectionSite | undefined;
  for (const s of INJECTION_SITES) {
    if (
      !best ||
      (lastUsed.get(s.id) ?? Infinity) > (lastUsed.get(best.id) ?? Infinity)
    ) {
      best = s;
    }
  }

  return { suggestedSiteId: best?.id ?? 'left_abdomen', restingSiteIds };
}
