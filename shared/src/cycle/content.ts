// Curated, offline content for the Cycle hub (Phase 5): health-library
// articles, condition pattern flags, postpartum/menopause catalogs, and the
// birth-plan / hospital-bag templates. All original/summarized; not medical
// advice. Article bodies are lightweight markdown rendered on the client.

import { CYCLE_DEFAULTS } from "./constants.ts";
import type { CycleMode, CycleStats, DerivedCycle } from "./types.ts";

export interface CycleArticle {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  tags: string[]; // modes/phases/topics for filtering + featured selection
  body: string; // markdown
}

export const CYCLE_ARTICLES: readonly CycleArticle[] = [
  {
    slug: "understanding-your-cycle",
    title: "Understanding your menstrual cycle",
    summary: "The four phases and what happens in each.",
    minutes: 4,
    tags: ["standard", "basics", "menstrual", "follicular", "luteal"],
    body: `## The four phases

Your cycle has four phases driven by shifting hormones:

- **Menstrual** — your period; estrogen and progesterone are low.
- **Follicular** — the body prepares to release an egg; energy often rises.
- **Ovulation** — an egg is released; this is your most fertile time.
- **Luteal** — the body prepares for a possible pregnancy; PMS can appear.

Tracking a few cycles helps the app learn your personal pattern and improve predictions.

*This is general information, not medical advice.*`,
  },
  {
    slug: "reading-your-bbt",
    title: "Reading your basal body temperature",
    summary: "How a biphasic BBT chart confirms ovulation.",
    minutes: 3,
    tags: ["ttc", "bbt", "ovulation"],
    body: `## What BBT tells you

Basal body temperature is your temperature at rest. After ovulation, progesterone
raises it slightly, creating a **biphasic** pattern — lower before ovulation, higher after.

Tips:
- Measure at the same time each morning, before getting up.
- A sustained rise of ~0.2–0.5 °C over your coverline suggests ovulation has happened.
- One cycle is a clue; several cycles reveal your pattern.`,
  },
  {
    slug: "fertile-window-basics",
    title: "The fertile window",
    summary: "The six days that matter most when trying to conceive.",
    minutes: 3,
    tags: ["ttc", "fertile", "ovulation"],
    body: `## Six fertile days

The fertile window is roughly the **five days before ovulation plus ovulation day**.
Sperm can survive several days, so intercourse before ovulation still counts.

Signs the window is opening: egg-white cervical mucus, a positive ovulation (LH) test,
and a rise in libido. Predictions are informational and never a form of contraception.`,
  },
  {
    slug: "pms-and-you",
    title: "Making sense of PMS",
    summary: "Why symptoms cluster in the late luteal phase.",
    minutes: 3,
    tags: ["standard", "luteal", "symptoms"],
    body: `## Premenstrual symptoms

PMS symptoms — cramps, mood changes, bloating, tender breasts — usually appear in the
**late luteal phase**, a few days before your period. Logging them helps the app forecast
when they are likely and spot changes over time.

If symptoms are severe or disrupt daily life, it is worth discussing with a clinician.`,
  },
  {
    slug: "first-trimester",
    title: "Your first trimester",
    summary: "What to expect in weeks 1–13.",
    minutes: 4,
    tags: ["pregnant", "trimester1"],
    body: `## Weeks 1–13

The first trimester is a time of rapid development. You may feel tired or nauseous as
hormones surge. Key steps: start a prenatal vitamin with folic acid, book your first
appointment, and rest when you can. Every pregnancy is different — follow your provider's guidance.`,
  },
  {
    slug: "third-trimester-prep",
    title: "Getting ready in the third trimester",
    summary: "Birth plan, hospital bag, and kick counts.",
    minutes: 4,
    tags: ["pregnant", "trimester3"],
    body: `## Weeks 28–40

The finish line. Now is a good time to draft a **birth plan**, pack a **hospital bag**,
and start **counting kicks** daily. Learn the 5-1-1 rule for contractions and know when to
contact your provider. Install the car seat early so it is one less thing to worry about.`,
  },
  {
    slug: "pcos-and-cycles",
    title: "Irregular cycles and PCOS",
    summary: "When cycles are long or unpredictable.",
    minutes: 4,
    tags: ["standard", "conditions", "pcos"],
    body: `## Irregular cycles

Cycles that are consistently longer than 35 days, or that vary widely, can have many causes —
including polycystic ovary syndrome (PCOS). Tracking gives you a clear record to share with a
clinician. This app can flag patterns, but only a healthcare professional can diagnose a condition.`,
  },
  {
    slug: "postpartum-recovery",
    title: "The fourth trimester",
    summary: "Recovery and the return of your cycle.",
    minutes: 4,
    tags: ["postpartum"],
    body: `## After birth

Recovery takes time. Your period may take weeks or months to return, especially while
breastfeeding, and the first cycles are often irregular — that is normal. Be gentle with
yourself, and reach out for support. If you feel persistently low or overwhelmed, talk to a provider.`,
  },
  {
    slug: "perimenopause",
    title: "Cycles in perimenopause",
    summary: "What changes as you approach menopause.",
    minutes: 3,
    tags: ["menopause"],
    body: `## Changing cycles

In perimenopause, cycles often become irregular and symptoms like hot flashes and sleep
changes can appear. Tracking cycle gaps and symptoms gives you a useful picture over time.
Predictions become less certain here, so the app focuses on your history rather than forecasts.`,
  },
];

export function articlesForMode(mode: CycleMode): CycleArticle[] {
  return CYCLE_ARTICLES.filter(
    (a) => a.tags.includes(mode) || a.tags.includes("basics"),
  );
}

export function featuredArticle(mode: CycleMode): CycleArticle {
  // Prefer an article tagged for this exact mode; fall back to a basics article.
  const modeSpecific = CYCLE_ARTICLES.find((a) => a.tags.includes(mode));
  return modeSpecific ?? articlesForMode(mode)[0] ?? CYCLE_ARTICLES[0]!;
}

export function articleBySlug(slug: string): CycleArticle | null {
  return CYCLE_ARTICLES.find((a) => a.slug === slug) ?? null;
}

// --- Condition pattern flags (5.9) -----------------------------------------

export interface ConditionFlag {
  key: string;
  severity: "info" | "attention";
  articleSlug: string;
}

/**
 * Conservative, educational pattern detection. Never diagnostic — every flag
 * points to an article and suggests discussing with a clinician.
 */
export function detectConditionFlags(
  _cycles: DerivedCycle[],
  stats: CycleStats,
): ConditionFlag[] {
  const flags: ConditionFlag[] = [];
  if (stats.sampleSize < 3) return flags;

  // Consistently long cycles → PCOS-associated pattern.
  if (stats.avgCycleLength > 35) {
    flags.push({
      key: "long_cycles",
      severity: "attention",
      articleSlug: "pcos-and-cycles",
    });
  }

  // Highly irregular cycles.
  if (stats.regularity === "irregular" && stats.cycleLengthSd > 7) {
    flags.push({
      key: "irregular_cycles",
      severity: "info",
      articleSlug: "pcos-and-cycles",
    });
  }

  // Very short cycles.
  if (stats.avgCycleLength < CYCLE_DEFAULTS.minCycle) {
    flags.push({
      key: "short_cycles",
      severity: "attention",
      articleSlug: "understanding-your-cycle",
    });
  }

  return flags;
}

// --- Postpartum / menopause catalogs (5.8) ---------------------------------

export const POSTPARTUM_SYMPTOMS = [
  { name: "bleeding", displayName: "Bleeding (lochia)", icon: "flow-medium", color: "period" },
  { name: "cramping", displayName: "Cramping", icon: "symptom-cramps", color: "period" },
  { name: "breast_pain", displayName: "Breast pain / engorgement", icon: "symptom-cramps", color: "period" },
  { name: "mood_changes", displayName: "Mood changes", icon: "mood-irritable", color: "lavender" },
  { name: "fatigue", displayName: "Exhaustion", icon: "symptom-fatigue", color: "amber" },
  { name: "night_sweats", displayName: "Night sweats", icon: "symptom-fatigue", color: "amber" },
] as const;

export const MENOPAUSE_SYMPTOMS = [
  { name: "hot_flashes", displayName: "Hot flashes", icon: "symptom-fatigue", color: "amber" },
  { name: "night_sweats", displayName: "Night sweats", icon: "symptom-fatigue", color: "amber" },
  { name: "sleep_trouble", displayName: "Sleep trouble", icon: "symptom-fatigue", color: "amber" },
  { name: "mood_changes", displayName: "Mood changes", icon: "mood-irritable", color: "lavender" },
  { name: "irregular_bleeding", displayName: "Irregular bleeding", icon: "flow-light", color: "period" },
  { name: "brain_fog", displayName: "Brain fog", icon: "symptom-headache", color: "lavender" },
] as const;

// --- Birth plan & hospital bag (5.13) --------------------------------------

export interface BirthPlanQuestion {
  key: string;
  question: string;
  options: string[];
}

export const BIRTH_PLAN_QUESTIONS: readonly BirthPlanQuestion[] = [
  { key: "environment", question: "Preferred environment", options: ["Dim lights", "Music", "Quiet", "My own clothes"] },
  { key: "pain_relief", question: "Pain relief preference", options: ["Epidural", "Natural / breathing", "Water / bath", "Decide during labor"] },
  { key: "support", question: "Who will be with you", options: ["Partner", "Doula", "Family member", "Just staff"] },
  { key: "monitoring", question: "Fetal monitoring", options: ["Intermittent if possible", "Continuous", "Follow provider advice"] },
  { key: "delivery", question: "Delivery preferences", options: ["Vaginal", "Water birth", "Flexible", "Planned C-section"] },
  { key: "after_birth", question: "Right after birth", options: ["Skin-to-skin", "Delayed cord clamping", "Partner cuts cord"] },
  { key: "feeding", question: "Feeding intention", options: ["Breastfeed", "Formula", "Combination", "Decide later"] },
];

export const HOSPITAL_BAG_ITEMS: readonly { key: string; title: string; category: string }[] = [
  { key: "id_docs", title: "ID and hospital documents", category: "essentials" },
  { key: "birth_plan", title: "Copy of your birth plan", category: "essentials" },
  { key: "phone_charger", title: "Phone and long charger", category: "essentials" },
  { key: "toiletries", title: "Toiletries", category: "comfort" },
  { key: "robe_slippers", title: "Robe and slippers", category: "comfort" },
  { key: "going_home_mom", title: "Going-home outfit (loose)", category: "clothing" },
  { key: "nursing_bras", title: "Nursing bras / pads", category: "clothing" },
  { key: "baby_outfit", title: "Baby going-home outfit", category: "baby" },
  { key: "baby_blanket", title: "Baby blanket", category: "baby" },
  { key: "car_seat", title: "Installed car seat", category: "baby" },
  { key: "snacks", title: "Snacks and drinks", category: "comfort" },
];
