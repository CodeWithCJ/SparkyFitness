// Static, offline pregnancy content: week-by-week baby development (the "in
// mummy's tummy" data), weekly checklist templates, and food/medication safety
// lists. All original/curated; no cloud, no scraping. Blurbs are inline English
// (i18n keys can wrap these later). Not medical advice.

export interface BabyWeek {
  week: number;
  comparison: string; // fruit/object size comparison
  lengthCm: number | null;
  weightG: number | null;
  /** Which womb illustration to show (nearest committed scene: 8, 20 or 36). */
  wombScene: 8 | 20 | 36;
  babyBlurb: string;
  momBlurb: string;
}

// Weeks 4–40. Lengths/weights are typical averages (crown-rump early, crown-heel later).
export const BABY_DEVELOPMENT: readonly BabyWeek[] = [
  { week: 4, comparison: 'A poppy seed', lengthCm: 0.1, weightG: null, wombScene: 8, babyBlurb: 'The embryo has implanted and the placenta is beginning to form.', momBlurb: 'You may have just missed your period. Early hormones are rising.' },
  { week: 5, comparison: 'A sesame seed', lengthCm: 0.2, weightG: null, wombScene: 8, babyBlurb: 'The neural tube — the start of the brain and spinal cord — is forming.', momBlurb: 'Early symptoms like tender breasts and fatigue may begin.' },
  { week: 6, comparison: 'A lentil', lengthCm: 0.5, weightG: null, wombScene: 8, babyBlurb: 'A tiny heart begins to beat and pump blood.', momBlurb: 'Morning sickness can start around now.' },
  { week: 7, comparison: 'A blueberry', lengthCm: 1, weightG: null, wombScene: 8, babyBlurb: 'Arm and leg buds are appearing; the brain is growing fast.', momBlurb: 'Your uterus is starting to expand, though it is not visible yet.' },
  { week: 8, comparison: 'A raspberry', lengthCm: 1.6, weightG: 1, wombScene: 8, babyBlurb: 'Fingers and toes are forming and tiny movements begin.', momBlurb: 'Blood volume is increasing to support your baby.' },
  { week: 9, comparison: 'A cherry', lengthCm: 2.3, weightG: 2, wombScene: 8, babyBlurb: 'Essential organs are formed; the baby is now officially a fetus.', momBlurb: 'You might notice mood changes from shifting hormones.' },
  { week: 10, comparison: 'A strawberry', lengthCm: 3.1, weightG: 4, wombScene: 8, babyBlurb: 'Vital organs are working and tiny nails start to develop.', momBlurb: 'Your waistline may start to change.' },
  { week: 11, comparison: 'A lime', lengthCm: 4.1, weightG: 7, wombScene: 8, babyBlurb: 'The baby can open and close its fists; bones are hardening.', momBlurb: 'Nausea often begins to ease in the coming weeks.' },
  { week: 12, comparison: 'A plum', lengthCm: 5.4, weightG: 14, wombScene: 8, babyBlurb: 'Reflexes are developing; the baby may curl its fingers and toes.', momBlurb: 'End of the first trimester is near — energy often returns.' },
  { week: 13, comparison: 'A peapod', lengthCm: 7.4, weightG: 23, wombScene: 20, babyBlurb: 'Tiny fingerprints are forming and vocal cords are developing.', momBlurb: 'Welcome to the second trimester — often the most comfortable.' },
  { week: 14, comparison: 'A lemon', lengthCm: 8.7, weightG: 43, wombScene: 20, babyBlurb: 'The baby can make facial expressions and may suck its thumb.', momBlurb: 'You may start to feel more like yourself again.' },
  { week: 15, comparison: 'An apple', lengthCm: 10, weightG: 70, wombScene: 20, babyBlurb: 'The baby can sense light and is moving amniotic fluid.', momBlurb: 'You might notice a little baby bump appearing.' },
  { week: 16, comparison: 'An avocado', lengthCm: 11.6, weightG: 100, wombScene: 20, babyBlurb: 'The baby can hear sounds and its heart pumps a lot of blood daily.', momBlurb: 'Some people feel the first flutters ("quickening") around now.' },
  { week: 17, comparison: 'A turnip', lengthCm: 13, weightG: 140, wombScene: 20, babyBlurb: 'Fat stores begin to form and the skeleton hardens.', momBlurb: 'Your center of gravity is shifting as your bump grows.' },
  { week: 18, comparison: 'A bell pepper', lengthCm: 14.2, weightG: 190, wombScene: 20, babyBlurb: 'The baby can hear your voice and may respond to sounds.', momBlurb: 'You may feel more defined movements now.' },
  { week: 19, comparison: 'A mango', lengthCm: 15.3, weightG: 240, wombScene: 20, babyBlurb: 'A protective coating (vernix) covers the skin.', momBlurb: 'Round-ligament aches are common as things stretch.' },
  { week: 20, comparison: 'A banana', lengthCm: 16.4, weightG: 300, wombScene: 20, babyBlurb: 'Halfway there! The baby is swallowing and developing taste buds.', momBlurb: 'Your anatomy-scan ultrasound often happens around now.' },
  { week: 21, comparison: 'A carrot', lengthCm: 26.7, weightG: 360, wombScene: 20, babyBlurb: 'The baby is moving more, with regular sleep and wake cycles.', momBlurb: 'You may feel kicks more strongly and regularly.' },
  { week: 22, comparison: 'A spaghetti squash', lengthCm: 27.8, weightG: 430, wombScene: 20, babyBlurb: 'Lips, eyelids and eyebrows are more distinct.', momBlurb: 'Your bump is now clearly visible.' },
  { week: 23, comparison: 'A large mango', lengthCm: 28.9, weightG: 501, wombScene: 20, babyBlurb: 'The baby can hear loud sounds and is putting on weight.', momBlurb: 'Swelling in feet and ankles can begin.' },
  { week: 24, comparison: 'An ear of corn', lengthCm: 30, weightG: 600, wombScene: 20, babyBlurb: 'The lungs are developing; the baby reaches a viability milestone.', momBlurb: 'You may have a glucose screening test soon.' },
  { week: 25, comparison: 'A rutabaga', lengthCm: 34.6, weightG: 660, wombScene: 20, babyBlurb: 'The baby is growing hair and its startle reflex is developing.', momBlurb: 'Backaches are common as your bump grows.' },
  { week: 26, comparison: 'A scallion bunch', lengthCm: 35.6, weightG: 760, wombScene: 20, babyBlurb: 'The eyes begin to open and lungs practice breathing motions.', momBlurb: 'You might feel rhythmic movements — the baby has hiccups.' },
  { week: 27, comparison: 'A cauliflower', lengthCm: 36.6, weightG: 875, wombScene: 20, babyBlurb: 'Brain activity increases sharply; the baby may recognize your voice.', momBlurb: 'Welcome to the third trimester.' },
  { week: 28, comparison: 'An eggplant', lengthCm: 37.6, weightG: 1005, wombScene: 36, babyBlurb: 'The baby can blink and its eyelashes have formed.', momBlurb: 'Prenatal visits often become more frequent now.' },
  { week: 29, comparison: 'A butternut squash', lengthCm: 38.6, weightG: 1150, wombScene: 36, babyBlurb: 'Muscles and lungs continue maturing; bones are fully formed.', momBlurb: 'You may feel short of breath as your uterus rises.' },
  { week: 30, comparison: 'A large cabbage', lengthCm: 39.9, weightG: 1320, wombScene: 36, babyBlurb: 'The baby can regulate its own temperature better now.', momBlurb: 'Fatigue can return in the third trimester.' },
  { week: 31, comparison: 'A coconut', lengthCm: 41.1, weightG: 1500, wombScene: 36, babyBlurb: 'The baby is putting on weight quickly and moving often.', momBlurb: 'You may notice Braxton-Hicks practice contractions.' },
  { week: 32, comparison: 'A jicama', lengthCm: 42.4, weightG: 1700, wombScene: 36, babyBlurb: 'The lungs are practicing breathing; the baby often settles head-down.', momBlurb: 'Consider starting your birth plan and hospital bag.' },
  { week: 33, comparison: 'A pineapple', lengthCm: 43.7, weightG: 1920, wombScene: 36, babyBlurb: 'The baby’s bones are hardening, though the skull stays soft.', momBlurb: 'You may feel more pressure in your pelvis.' },
  { week: 34, comparison: 'A cantaloupe', lengthCm: 45, weightG: 2150, wombScene: 36, babyBlurb: 'The central nervous system and lungs are maturing well.', momBlurb: 'Fatigue and swelling are common; rest when you can.' },
  { week: 35, comparison: 'A honeydew melon', lengthCm: 46.2, weightG: 2380, wombScene: 36, babyBlurb: 'The baby is filling out; most systems are nearly ready.', momBlurb: 'Your provider may check the baby’s position.' },
  { week: 36, comparison: 'A head of romaine', lengthCm: 47.4, weightG: 2620, wombScene: 36, babyBlurb: 'The baby is likely head-down and gaining ~28 g a day.', momBlurb: 'Weekly checkups usually begin around now.' },
  { week: 37, comparison: 'A bunch of Swiss chard', lengthCm: 48.6, weightG: 2860, wombScene: 36, babyBlurb: 'The baby is considered early term and practicing breathing.', momBlurb: 'Watch for signs of labor and keep your bag ready.' },
  { week: 38, comparison: 'A leek', lengthCm: 49.8, weightG: 3080, wombScene: 36, babyBlurb: 'Organs are ready for life outside; the baby has a firm grasp.', momBlurb: 'You may feel the baby "drop" lower into your pelvis.' },
  { week: 39, comparison: 'A mini watermelon', lengthCm: 50.7, weightG: 3290, wombScene: 36, babyBlurb: 'The baby is full term and ready to meet you.', momBlurb: 'Any day now — watch for regular contractions.' },
  { week: 40, comparison: 'A small pumpkin', lengthCm: 51.2, weightG: 3460, wombScene: 36, babyBlurb: 'Your due date is here! Babies arrive on their own schedule.', momBlurb: 'If labor hasn’t started, your provider will discuss next steps.' },
] as const;

export function babyWeek(week: number): BabyWeek | null {
  return BABY_DEVELOPMENT.find((b) => b.week === week) ?? null;
}

export interface ChecklistTemplateItem {
  key: string;
  weekStart: number;
  weekEnd: number;
  title: string;
}

export const CHECKLIST_TEMPLATES: readonly ChecklistTemplateItem[] = [
  { key: 'first_appt', weekStart: 6, weekEnd: 10, title: 'Book your first prenatal appointment' },
  { key: 'prenatal_vitamin', weekStart: 4, weekEnd: 12, title: 'Start a prenatal vitamin with folic acid' },
  { key: 'nt_scan', weekStart: 11, weekEnd: 14, title: 'Schedule first-trimester screening' },
  { key: 'share_news', weekStart: 12, weekEnd: 16, title: 'Share your news if you’re ready' },
  { key: 'anatomy_scan', weekStart: 18, weekEnd: 22, title: 'Attend your anatomy-scan ultrasound' },
  { key: 'glucose_test', weekStart: 24, weekEnd: 28, title: 'Book your glucose screening test' },
  { key: 'count_kicks', weekStart: 24, weekEnd: 40, title: 'Start counting fetal kicks daily' },
  { key: 'birth_class', weekStart: 28, weekEnd: 34, title: 'Enroll in a birth or parenting class' },
  { key: 'birth_plan', weekStart: 30, weekEnd: 36, title: 'Draft your birth plan' },
  { key: 'hospital_bag', weekStart: 32, weekEnd: 37, title: 'Pack your hospital bag' },
  { key: 'install_car_seat', weekStart: 35, weekEnd: 39, title: 'Install and check the car seat' },
  { key: 'pediatrician', weekStart: 34, weekEnd: 40, title: 'Choose a pediatrician' },
] as const;

export function checklistForWeek(week: number): ChecklistTemplateItem[] {
  return CHECKLIST_TEMPLATES.filter(
    (i) => week >= i.weekStart && week <= i.weekEnd,
  );
}

export type SafetyStatus = 'safe' | 'caution' | 'avoid';

export interface SafetyItem {
  name: string;
  aliases: string[];
  status: SafetyStatus;
  note: string;
  category: string;
}

export const FOOD_SAFETY: readonly SafetyItem[] = [
  { name: 'Cooked salmon', aliases: ['salmon'], status: 'safe', note: 'Well-cooked, low-mercury fish is a great source of omega-3s. Aim for 2–3 servings/week.', category: 'fish' },
  { name: 'Tuna (canned light)', aliases: ['tuna'], status: 'caution', note: 'Limit to ~2 servings/week; choose light over albacore for lower mercury.', category: 'fish' },
  { name: 'Swordfish', aliases: ['shark', 'king mackerel', 'marlin'], status: 'avoid', note: 'High-mercury fish should be avoided during pregnancy.', category: 'fish' },
  { name: 'Sushi (raw)', aliases: ['sashimi', 'raw fish'], status: 'avoid', note: 'Raw fish carries a risk of parasites and bacteria. Cooked rolls are fine.', category: 'fish' },
  { name: 'Shrimp (cooked)', aliases: ['prawns'], status: 'safe', note: 'Fully cooked shellfish is low-mercury and safe.', category: 'fish' },
  { name: 'Soft cheese (unpasteurized)', aliases: ['brie', 'feta', 'camembert', 'blue cheese'], status: 'avoid', note: 'Unpasteurized soft cheeses risk listeria. Pasteurized versions are fine.', category: 'dairy' },
  { name: 'Hard cheese', aliases: ['cheddar', 'parmesan'], status: 'safe', note: 'Hard and pasteurized cheeses are safe.', category: 'dairy' },
  { name: 'Pasteurized milk', aliases: ['milk'], status: 'safe', note: 'Pasteurized dairy is safe and a good calcium source.', category: 'dairy' },
  { name: 'Deli meat (cold)', aliases: ['lunch meat', 'cold cuts', 'ham'], status: 'caution', note: 'Heat until steaming to reduce listeria risk.', category: 'meat' },
  { name: 'Undercooked meat', aliases: ['rare steak', 'raw meat'], status: 'avoid', note: 'Cook meat thoroughly to avoid toxoplasmosis and bacteria.', category: 'meat' },
  { name: 'Cooked chicken', aliases: ['chicken', 'poultry'], status: 'safe', note: 'Fully cooked poultry is a safe protein source.', category: 'meat' },
  { name: 'Runny/raw eggs', aliases: ['raw egg', 'soft egg'], status: 'caution', note: 'Cook until firm, or use pasteurized eggs, to avoid salmonella.', category: 'eggs' },
  { name: 'Coffee', aliases: ['caffeine', 'espresso'], status: 'caution', note: 'Limit caffeine to about 200 mg/day (roughly one 12 oz coffee).', category: 'drinks' },
  { name: 'Alcohol', aliases: ['wine', 'beer', 'liquor'], status: 'avoid', note: 'No amount of alcohol is considered safe during pregnancy.', category: 'drinks' },
  { name: 'Herbal tea', aliases: ['tea'], status: 'caution', note: 'Some herbs are not recommended; check specific teas with your provider.', category: 'drinks' },
  { name: 'Cooked leafy greens', aliases: ['spinach', 'kale', 'vegetables'], status: 'safe', note: 'Wash well; a great source of folate and iron.', category: 'produce' },
  { name: 'Unwashed produce', aliases: ['raw sprouts', 'sprouts'], status: 'caution', note: 'Wash thoroughly; avoid raw sprouts, which can harbor bacteria.', category: 'produce' },
  { name: 'Liver / pâté', aliases: ['liver', 'pate'], status: 'avoid', note: 'Very high in vitamin A, which can be harmful in large amounts.', category: 'meat' },
  { name: 'Peanuts', aliases: ['nuts'], status: 'safe', note: 'Safe unless you have a personal allergy; a good protein source.', category: 'other' },
  { name: 'Honey', aliases: [], status: 'safe', note: 'Safe for you in pregnancy (avoid giving to infants under 1 year).', category: 'other' },
] as const;

export const MED_SAFETY: readonly SafetyItem[] = [
  { name: 'Acetaminophen (Tylenol)', aliases: ['paracetamol', 'tylenol', 'acetaminophen'], status: 'safe', note: 'Generally considered first-line for pain/fever at recommended doses. Confirm with your provider.', category: 'pain' },
  { name: 'Ibuprofen (Advil)', aliases: ['ibuprofen', 'advil', 'nsaid', 'motrin'], status: 'caution', note: 'Avoid especially in the third trimester; use only if your provider advises.', category: 'pain' },
  { name: 'Aspirin', aliases: ['aspirin'], status: 'caution', note: 'Only low-dose if prescribed; regular-dose aspirin is generally avoided.', category: 'pain' },
  { name: 'Prenatal vitamin', aliases: ['prenatal', 'folic acid'], status: 'safe', note: 'Recommended throughout pregnancy for folic acid, iron and DHA.', category: 'supplement' },
  { name: 'Antacids (Tums)', aliases: ['tums', 'calcium carbonate', 'antacid'], status: 'safe', note: 'Calcium-based antacids are commonly used for heartburn.', category: 'digestion' },
  { name: 'Diphenhydramine (Benadryl)', aliases: ['benadryl', 'diphenhydramine'], status: 'caution', note: 'Often considered okay short-term, but check with your provider.', category: 'allergy' },
  { name: 'Ibuprofen gel', aliases: ['topical nsaid'], status: 'caution', note: 'Discuss topical NSAIDs with your provider before use.', category: 'pain' },
  { name: 'Isotretinoin (Accutane)', aliases: ['accutane', 'isotretinoin', 'retinoid'], status: 'avoid', note: 'Retinoids cause serious birth defects and must be avoided.', category: 'skin' },
  { name: 'Decongestant (pseudoephedrine)', aliases: ['sudafed', 'pseudoephedrine'], status: 'caution', note: 'Generally avoided in the first trimester; ask your provider.', category: 'cold' },
  { name: 'Vitamin A (high dose)', aliases: ['retinol', 'vitamin a'], status: 'avoid', note: 'High-dose vitamin A can harm the baby; stick to prenatal amounts.', category: 'supplement' },
] as const;

export function lookupSafety(
  query: string,
  list: readonly SafetyItem[],
): SafetyItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase())),
  );
}

/**
 * Match a user's medication name against the caution/avoid med-safety list.
 * Matches on aliases (whole-word) only — conservative, so a generic word like
 * "vitamin" in "prenatal vitamin" never trips the "Vitamin A" avoid entry.
 */
export function matchMedSafety(medName: string): SafetyItem | null {
  const words = new Set(
    medName
      .trim()
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
  );
  if (words.size === 0) return null;
  for (const item of MED_SAFETY) {
    if (item.status === 'safe') continue;
    for (const alias of item.aliases) {
      const aliasWords = alias.toLowerCase().split(/\s+/).filter(Boolean);
      // Single-word alias: require an exact word match. Multi-word alias:
      // require all words present.
      if (aliasWords.every((w) => words.has(w))) return item;
    }
  }
  return null;
}
