// Catalogs and defaults for the Cycle & Pregnancy hub. Predefined lists are
// starting points, never limits — users extend them the same way they extend
// medications/symptoms. Each loggable item carries an `icon` id and `color`
// token so the UI can render the colorful domain-icon set consistently.

import type { CycleMode, FlowLevel } from "./types.ts";

export const CYCLE_MODES: readonly CycleMode[] = [
  "standard",
  "ttc",
  "pregnant",
  "postpartum",
  "menopause",
] as const;

export interface FlowOption {
  value: FlowLevel;
  displayName: string;
  icon: string;
  color: string;
  /** Relative volume weight used by flow-volume estimation when no products logged. */
  weight: number;
  isPeriodEvidence: boolean;
}

export const FLOW_LEVELS: readonly FlowOption[] = [
  { value: "none", displayName: "None", icon: "flow-none", color: "neutral", weight: 0, isPeriodEvidence: false },
  { value: "spotting", displayName: "Spotting", icon: "flow-spotting", color: "period", weight: 0.5, isPeriodEvidence: true },
  { value: "light", displayName: "Light", icon: "flow-light", color: "period", weight: 1, isPeriodEvidence: true },
  { value: "medium", displayName: "Medium", icon: "flow-medium", color: "period", weight: 2, isPeriodEvidence: true },
  { value: "heavy", displayName: "Heavy", icon: "flow-heavy", color: "period", weight: 3, isPeriodEvidence: true },
] as const;

export function isPeriodEvidenceFlow(flow?: string | null): boolean {
  if (!flow) return false;
  return FLOW_LEVELS.some((f) => f.value === flow && f.isPeriodEvidence);
}

export type SymptomCategory =
  | "pain"
  | "skin"
  | "digestion"
  | "mental"
  | "discharge"
  | "other";

export interface CycleSymptomDef {
  name: string;
  displayName: string;
  category: SymptomCategory;
  icon: string;
  color: string;
}

// Category → default color token, so custom symptoms inherit a sensible color.
export const SYMPTOM_CATEGORY_COLOR: Record<SymptomCategory, string> = {
  pain: "period",
  skin: "amber",
  digestion: "green",
  mental: "lavender",
  discharge: "sky",
  other: "neutral",
};

export const BUILT_IN_CYCLE_SYMPTOMS: readonly CycleSymptomDef[] = [
  { name: "cramps", displayName: "Cramps", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "headache", displayName: "Headache", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "migraine", displayName: "Migraine", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "backache", displayName: "Backache", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "ovulation_pain", displayName: "Ovulation pain", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "tender_breasts", displayName: "Tender breasts", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "nausea", displayName: "Nausea", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "bloating", displayName: "Bloating", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "diarrhea", displayName: "Diarrhea", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "constipation", displayName: "Constipation", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "cravings", displayName: "Cravings", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "acne", displayName: "Acne", category: "skin", icon: "symptom-fatigue", color: "amber" },
  { name: "oily_skin", displayName: "Oily skin", category: "skin", icon: "symptom-fatigue", color: "amber" },
  { name: "fatigue", displayName: "Fatigue", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "insomnia", displayName: "Insomnia", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "dizziness", displayName: "Dizziness", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "mood_swings", displayName: "Mood swings", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "anxiety", displayName: "Anxiety", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "hot_flashes", displayName: "Hot flashes", category: "other", icon: "symptom-fatigue", color: "amber" },
  { name: "spotting", displayName: "Spotting", category: "discharge", icon: "flow-spotting", color: "period" },
  { name: "body_aches", displayName: "Body aches", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "joint_pain", displayName: "Joint pain", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "muscle_soreness", displayName: "Muscle soreness", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "pelvic_pain", displayName: "Pelvic pain", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "cervical_pain", displayName: "Cervical pain", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "stiff_neck", displayName: "Stiff neck", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "digestive_cramps", displayName: "Digestive cramps", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "acid_reflux", displayName: "Acid reflux", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "indigestion", displayName: "Indigestion", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "increased_appetite", displayName: "Increased appetite", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "decreased_appetite", displayName: "Decreased appetite", category: "digestion", icon: "symptom-nausea", color: "green" },
  { name: "fatigue_morning", displayName: "Morning fatigue", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "brain_fog", displayName: "Brain fog", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "irritability", displayName: "Irritability", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "sadness", displayName: "Sadness", category: "mental", icon: "symptom-headache", color: "lavender" },
  { name: "oversleeping", displayName: "Oversleeping", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "restless_sleep", displayName: "Restless sleep", category: "mental", icon: "symptom-fatigue", color: "amber" },
  { name: "dry_skin", displayName: "Dry skin", category: "skin", icon: "symptom-fatigue", color: "amber" },
  { name: "skin_breakouts", displayName: "Skin breakouts", category: "skin", icon: "symptom-fatigue", color: "amber" },
  { name: "chills", displayName: "Chills", category: "other", icon: "symptom-fatigue", color: "amber" },
  { name: "night_sweats", displayName: "Night sweats", category: "other", icon: "symptom-fatigue", color: "amber" },
  { name: "swollen_feet", displayName: "Swollen feet", category: "pain", icon: "symptom-cramps", color: "period" },
  { name: "breast_swelling", displayName: "Breast swelling", category: "pain", icon: "symptom-cramps", color: "period" },
] as const;

export interface MoodTagDef {
  name: string;
  displayName: string;
  icon: string;
  color: string;
}

export const CYCLE_MOOD_TAGS: readonly MoodTagDef[] = [
  { name: "happy", displayName: "Happy", icon: "mood-happy", color: "amber" },
  { name: "calm", displayName: "Calm", icon: "mood-calm", color: "green" },
  { name: "energetic", displayName: "Energetic", icon: "mood-happy", color: "amber" },
  { name: "sensitive", displayName: "Sensitive", icon: "mood-calm", color: "sky" },
  { name: "irritable", displayName: "Irritable", icon: "mood-irritable", color: "period" },
  { name: "anxious", displayName: "Anxious", icon: "mood-irritable", color: "lavender" },
  { name: "sad", displayName: "Sad", icon: "mood-calm", color: "sky" },
  { name: "low", displayName: "Low energy", icon: "mood-calm", color: "sky" },
] as const;

export interface MucusTypeDef {
  value: string;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  fertile: boolean;
}

export const CERVICAL_MUCUS_TYPES: readonly MucusTypeDef[] = [
  { value: "dry", displayName: "Dry", description: "No noticeable discharge", icon: "mucus-eggwhite", color: "neutral", fertile: false },
  { value: "sticky", displayName: "Sticky", description: "Thick, tacky", icon: "mucus-eggwhite", color: "amber", fertile: false },
  { value: "creamy", displayName: "Creamy", description: "Lotion-like", icon: "mucus-eggwhite", color: "amber", fertile: false },
  { value: "watery", displayName: "Watery", description: "Thin, slippery", icon: "mucus-eggwhite", color: "sky", fertile: true },
  { value: "egg-white", displayName: "Egg-white", description: "Clear, stretchy — most fertile", icon: "mucus-eggwhite", color: "sky", fertile: true },
] as const;

export const UNUSUAL_DISCHARGE_FLAGS = [
  "gray",
  "green",
  "yellow",
  "clumpy",
  "odor",
  "itch",
] as const;

export interface ProductDef {
  value: string;
  displayName: string;
  icon: string;
  color: string;
  /** Typical absorbed/collected ml for a fully-used product; powers flow-volume estimate. */
  capacityMl: number;
}

export const PERIOD_PRODUCTS: readonly ProductDef[] = [
  { value: "pad", displayName: "Pad", icon: "product-pad", color: "period", capacityMl: 5 },
  { value: "tampon", displayName: "Tampon", icon: "product-tampon", color: "period", capacityMl: 5 },
  { value: "cup", displayName: "Cup", icon: "product-cup", color: "period", capacityMl: 20 },
  { value: "liner", displayName: "Liner", icon: "product-pad", color: "period", capacityMl: 1 },
  { value: "period_underwear", displayName: "Period underwear", icon: "product-pad", color: "period", capacityMl: 10 },
  { value: "disc", displayName: "Disc", icon: "product-cup", color: "period", capacityMl: 20 },
] as const;

export const PRODUCT_CAPACITY_ML: Record<string, number> = Object.fromEntries(
  PERIOD_PRODUCTS.map((p) => [p.value, p.capacityMl]),
);

export const BIRTH_CONTROL_METHODS = [
  { value: "none", displayName: "None", hormonal: false },
  { value: "pill", displayName: "Pill", hormonal: true },
  { value: "iud_hormonal", displayName: "Hormonal IUD", hormonal: true },
  { value: "iud_copper", displayName: "Copper IUD", hormonal: false },
  { value: "implant", displayName: "Implant", hormonal: true },
  { value: "ring", displayName: "Ring", hormonal: true },
  { value: "patch", displayName: "Patch", hormonal: true },
  { value: "shot", displayName: "Shot", hormonal: true },
  { value: "condoms", displayName: "Condoms / barrier", hormonal: false },
  { value: "other", displayName: "Other", hormonal: false },
] as const;

const HORMONAL_BC = new Set<string>(
  BIRTH_CONTROL_METHODS.filter((m) => m.hormonal).map((m) => m.value),
);

export function isHormonalBc(method?: string | null): boolean {
  return !!method && HORMONAL_BC.has(method);
}

export const CYCLE_CONDITIONS = [
  { value: "pcos", displayName: "PCOS" },
  { value: "endometriosis", displayName: "Endometriosis" },
  { value: "fibroids", displayName: "Fibroids" },
  { value: "thyroid", displayName: "Thyroid condition" },
  { value: "other", displayName: "Other" },
] as const;

export const CYCLE_DEFAULTS = {
  cycleLength: 28,
  periodLength: 5,
  lutealLength: 14,
  minCycle: 21,
  maxCycle: 45,
  /** Fertile window: ovulation - 5 days ... ovulation + 1 day. */
  fertileBefore: 5,
  fertileAfter: 1,
  /** Number of most-recent completed cycles used for statistics. */
  statsWindow: 6,
} as const;

export interface DailyInsightRule {
  key: string; // i18n key suffix
  phase: string; // CyclePhase or "any"
  mode?: CycleMode;
  priority: number;
}

// A small starter rule table for the "Today's insight" card. Copy lives in i18n
// under cycle.insight.<key>. Deterministic selection keeps one tip per day.
export const DAILY_INSIGHTS: readonly DailyInsightRule[] = [
  { key: "menstrual_rest", phase: "menstrual", priority: 10 },
  { key: "menstrual_iron", phase: "menstrual", priority: 8 },
  { key: "follicular_energy", phase: "follicular", priority: 10 },
  { key: "fertile_window", phase: "fertile", priority: 10 },
  { key: "ovulation_peak", phase: "ovulation", priority: 12 },
  { key: "luteal_dip", phase: "luteal", priority: 10 },
  { key: "luteal_pms", phase: "luteal", priority: 8 },
  { key: "generic_log", phase: "any", priority: 1 },
] as const;

export interface HormonePoint {
  day: number;
  estrogen: number;
  progesterone: number;
  lh: number;
  fsh: number;
}

export const HORMONE_CURVES: readonly HormonePoint[] = [
  { day: 1, estrogen: 10, progesterone: 2, lh: 5, fsh: 12 },
  { day: 2, estrogen: 11, progesterone: 2, lh: 5, fsh: 12 },
  { day: 3, estrogen: 12, progesterone: 2, lh: 5, fsh: 11 },
  { day: 4, estrogen: 13, progesterone: 2, lh: 5, fsh: 11 },
  { day: 5, estrogen: 15, progesterone: 2, lh: 6, fsh: 10 },
  { day: 6, estrogen: 18, progesterone: 2, lh: 6, fsh: 10 },
  { day: 7, estrogen: 22, progesterone: 2, lh: 7, fsh: 10 },
  { day: 8, estrogen: 28, progesterone: 2, lh: 7, fsh: 10 },
  { day: 9, estrogen: 35, progesterone: 2, lh: 8, fsh: 11 },
  { day: 10, estrogen: 45, progesterone: 3, lh: 9, fsh: 12 },
  { day: 11, estrogen: 60, progesterone: 3, lh: 12, fsh: 14 },
  { day: 12, estrogen: 85, progesterone: 4, lh: 25, fsh: 18 },
  { day: 13, estrogen: 100, progesterone: 5, lh: 100, fsh: 35 },
  { day: 14, estrogen: 40, progesterone: 8, lh: 30, fsh: 15 },
  { day: 15, estrogen: 25, progesterone: 15, lh: 10, fsh: 10 },
  { day: 16, estrogen: 30, progesterone: 25, lh: 8, fsh: 8 },
  { day: 17, estrogen: 35, progesterone: 40, lh: 7, fsh: 7 },
  { day: 18, estrogen: 42, progesterone: 55, lh: 6, fsh: 6 },
  { day: 19, estrogen: 48, progesterone: 70, lh: 6, fsh: 6 },
  { day: 20, estrogen: 52, progesterone: 80, lh: 5, fsh: 5 },
  { day: 21, estrogen: 55, progesterone: 85, lh: 5, fsh: 5 },
  { day: 22, estrogen: 52, progesterone: 80, lh: 5, fsh: 5 },
  { day: 23, estrogen: 45, progesterone: 65, lh: 5, fsh: 5 },
  { day: 24, estrogen: 35, progesterone: 45, lh: 5, fsh: 6 },
  { day: 25, estrogen: 25, progesterone: 30, lh: 5, fsh: 7 },
  { day: 26, estrogen: 18, progesterone: 18, lh: 5, fsh: 8 },
  { day: 27, estrogen: 12, progesterone: 8, lh: 5, fsh: 10 },
  { day: 28, estrogen: 10, progesterone: 3, lh: 5, fsh: 11 },
];

export const OPK_RESULTS = ['negative', 'low', 'high', 'peak'] as const;
export const PREGNANCY_TEST_RESULTS = ['negative', 'faint', 'positive'] as const;

export const CERVICAL_POSITION_OPTIONS = {
  position: [
    { value: 'low', displayName: 'Low' },
    { value: 'medium', displayName: 'Medium' },
    { value: 'high', displayName: 'High' },
  ],
  firmness: [
    { value: 'firm', displayName: 'Firm' },
    { value: 'medium', displayName: 'Medium' },
    { value: 'soft', displayName: 'Soft' },
  ],
  opening: [
    { value: 'closed', displayName: 'Closed' },
    { value: 'medium', displayName: 'Medium' },
    { value: 'open', displayName: 'Open' },
  ],
} as const;

