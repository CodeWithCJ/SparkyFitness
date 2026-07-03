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
  cadence: "weekly" | "daily";
}

/**
 * Published, approximate pharmacokinetics. Values are rounded from label/literature and are
 * intended for modeling/illustration, not clinical dosing.
 */
export const GLP1_DRUG_PROFILES: Record<string, Glp1DrugProfile> = {
  semaglutide: {
    id: "semaglutide",
    displayName: "Semaglutide",
    brands: ["Ozempic", "Wegovy"],
    halfLifeDays: 7,
    tMaxDays: 1.5,
    cadence: "weekly",
  },
  oral_semaglutide: {
    id: "oral_semaglutide",
    displayName: "Semaglutide (oral)",
    brands: ["Rybelsus"],
    halfLifeDays: 7,
    tMaxDays: 1,
    cadence: "daily",
  },
  tirzepatide: {
    id: "tirzepatide",
    displayName: "Tirzepatide",
    brands: ["Mounjaro", "Zepbound"],
    halfLifeDays: 5,
    tMaxDays: 1.5,
    cadence: "weekly",
  },
  dulaglutide: {
    id: "dulaglutide",
    displayName: "Dulaglutide",
    brands: ["Trulicity"],
    halfLifeDays: 4.7,
    tMaxDays: 2,
    cadence: "weekly",
  },
  liraglutide: {
    id: "liraglutide",
    displayName: "Liraglutide",
    brands: ["Saxenda", "Victoza"],
    halfLifeDays: 0.54, // ~13 hours
    tMaxDays: 0.46, // ~8-12 hours
    cadence: "daily",
  },
  retatrutide: {
    id: "retatrutide",
    displayName: "Retatrutide",
    brands: [],
    halfLifeDays: 6,
    tMaxDays: 1.5,
    cadence: "weekly",
  },
};

/** Resolve a drug profile by id or (case-insensitive) brand name. */
export function resolveGlp1Profile(
  idOrBrand: string,
): Glp1DrugProfile | undefined {
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
  profile: Pick<Glp1DrugProfile, "halfLifeDays" | "tMaxDays">,
): number {
  const ke = eliminationRate(profile.halfLifeDays);
  // Absorption rate: derived so the single-dose peak lands near tMax.
  const ka =
    profile.tMaxDays > 0
      ? Math.max(ke * 1.5, Math.LN2 / profile.tMaxDays)
      : ke * 4;
  let level = 0;
  for (const d of doses) {
    const t = day - d.day;
    if (t < 0) continue;
    if (Math.abs(ka - ke) < 1e-6) {
      level += d.doseMg * ke * t * Math.exp(-ke * t);
    } else {
      // Bateman function (one-compartment, first-order absorption + elimination).
      level +=
        ((d.doseMg * ka) / (ka - ke)) * (Math.exp(-ke * t) - Math.exp(-ka * t));
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
  profile: Pick<Glp1DrugProfile, "halfLifeDays" | "tMaxDays">,
  fromDay: number,
  toDay: number,
  stepDays = 0.25,
): SerumPoint[] {
  const raw: { day: number; level: number }[] = [];
  for (let day = fromDay; day <= toDay + 1e-9; day += stepDays) {
    raw.push({
      day: Number(day.toFixed(4)),
      level: serumLevelAt(day, doses, profile),
    });
  }
  const peak = raw.reduce((m, p) => Math.max(m, p.level), 0) || 1;
  return raw.map((p) => ({ ...p, fraction: p.level / peak }));
}

/**
 * Subcutaneous GLP-1 injection zones (granular, matching common GLP-1 trackers).
 * `svgClass` is the class applied to the matching `<path>` in the clickable body map SVG
 * (`public/images/injection-body.svg`).
 */
export interface InjectionSite {
  id: string;
  label: string;
  region: "abdomen" | "thigh" | "arm" | "hip" | "other";
  side: "left" | "mid" | "right" | "none";
  svgClass: string;
}

export const INJECTION_SITES: InjectionSite[] = [
  {
    id: "stomach_upper_left",
    label: "Stomach – Upper Left",
    region: "abdomen",
    side: "left",
    svgClass: "stomach_upper_left",
  },
  {
    id: "stomach_upper_mid",
    label: "Stomach – Upper Mid",
    region: "abdomen",
    side: "mid",
    svgClass: "stomach_upper_mid",
  },
  {
    id: "stomach_upper_right",
    label: "Stomach – Upper Right",
    region: "abdomen",
    side: "right",
    svgClass: "stomach_upper_right",
  },
  {
    id: "stomach_mid_left",
    label: "Stomach – Left Mid",
    region: "abdomen",
    side: "left",
    svgClass: "stomach_mid_left",
  },
  {
    id: "stomach_mid_right",
    label: "Stomach – Right Mid",
    region: "abdomen",
    side: "right",
    svgClass: "stomach_mid_right",
  },
  {
    id: "stomach_lower_left",
    label: "Stomach – Lower Left",
    region: "abdomen",
    side: "left",
    svgClass: "stomach_lower_left",
  },
  {
    id: "stomach_lower_mid",
    label: "Stomach – Lower Mid",
    region: "abdomen",
    side: "mid",
    svgClass: "stomach_lower_mid",
  },
  {
    id: "stomach_lower_right",
    label: "Stomach – Lower Right",
    region: "abdomen",
    side: "right",
    svgClass: "stomach_lower_right",
  },
  {
    id: "left_arm",
    label: "Left Arm",
    region: "arm",
    side: "left",
    svgClass: "left_arm",
  },
  {
    id: "right_arm",
    label: "Right Arm",
    region: "arm",
    side: "right",
    svgClass: "right_arm",
  },
  {
    id: "left_thigh",
    label: "Left Thigh",
    region: "thigh",
    side: "left",
    svgClass: "left_thigh",
  },
  {
    id: "right_thigh",
    label: "Right Thigh",
    region: "thigh",
    side: "right",
    svgClass: "right_thigh",
  },
  {
    id: "left_hip",
    label: "Left Hip",
    region: "hip",
    side: "left",
    svgClass: "left_hip",
  },
  {
    id: "right_hip",
    label: "Right Hip",
    region: "hip",
    side: "right",
    svgClass: "right_hip",
  },
  {
    id: "unknown",
    label: "Unknown",
    region: "other",
    side: "none",
    svgClass: "unknown",
  },
];

/** Minimum days a site should rest before reuse (lipohypertrophy guidance). */
export const SITE_REST_DAYS = 7;

export interface RecentSiteUse {
  siteId: string;
  /** whole or fractional days since this site was last used */
  daysAgo: number;
}

export interface SiteRotationResult {
  /** suggested next site id (rotates forward; the longest-rested if all are within the window) */
  suggestedSiteId: string;
  /** site ids that are still within the rest window and should be avoided */
  restingSiteIds: string[];
}

/**
 * Suggest the next injection site.
 * - `activeSiteIds` (optional, ordered): the user's active sites in rotation order; when omitted,
 *   all built-in sites except `unknown` are used. Lets Settings drive customization + auto-rotation.
 * - Rotation: start just after the most-recently-used site and pick the first one past its rest
 *   window; if every candidate is still resting, fall back to the one rested longest.
 * - Flags any candidate used within `SITE_REST_DAYS` as resting (lipo warning).
 */
export function suggestNextSite(
  recent: RecentSiteUse[],
  activeSiteIds?: string[],
): SiteRotationResult {
  const candidates = (
    activeSiteIds && activeSiteIds.length > 0
      ? activeSiteIds
      : INJECTION_SITES.map((s) => s.id)
  ).filter((id) => id !== "unknown");

  const lastUsed = new Map<string, number>();
  let mostRecentId: string | undefined;
  let mostRecentDaysAgo = Infinity;
  for (const r of recent) {
    const prev = lastUsed.get(r.siteId);
    if (prev === undefined || r.daysAgo < prev)
      lastUsed.set(r.siteId, r.daysAgo);
    if (r.daysAgo < mostRecentDaysAgo) {
      mostRecentDaysAgo = r.daysAgo;
      mostRecentId = r.siteId;
    }
  }

  const restingSiteIds = candidates.filter(
    (id) => (lastUsed.get(id) ?? Infinity) < SITE_REST_DAYS,
  );

  if (candidates.length === 0) {
    return { suggestedSiteId: "unknown", restingSiteIds };
  }

  // Rotate forward from the site used most recently.
  const lastIdx = mostRecentId ? candidates.indexOf(mostRecentId) : -1;
  const startIdx = lastIdx >= 0 ? lastIdx + 1 : 0;
  let suggested: string | undefined;
  for (let i = 0; i < candidates.length; i++) {
    const id = candidates[(startIdx + i) % candidates.length];
    if (id && (lastUsed.get(id) ?? Infinity) >= SITE_REST_DAYS) {
      suggested = id;
      break;
    }
  }
  // Everything is still resting → the one rested longest.
  if (!suggested) {
    for (const id of candidates) {
      if (
        !suggested ||
        (lastUsed.get(id) ?? Infinity) > (lastUsed.get(suggested) ?? Infinity)
      ) {
        suggested = id;
      }
    }
  }

  return {
    suggestedSiteId: suggested ?? candidates[0] ?? "unknown",
    restingSiteIds,
  };
}
