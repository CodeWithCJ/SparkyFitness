import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  localizeBabyWeek,
  formatBabyLength,
} from '../../src/utils/pregnancyContentLocalization';
import {
  localizeSafetyName,
  localizeSafetyNote,
  lookupSafetyLocalized,
} from '../../src/utils/pregnancySafetyLocalization';
import { FOOD_SAFETY, MED_SAFETY } from '@workspace/shared';

describe('semantic pluralization (final coverage)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const counts = [1, 2, 5, 12, 22, 25];

  test('fertility.days pluralization (EN/PL 1/2/5/12/22/25)', async () => {
    const enExp: Record<number, string> = { 1: '1 day', 2: '2 days', 5: '5 days', 12: '12 days', 22: '22 days', 25: '25 days' };
    const plExp: Record<number, string> = { 1: '1 dzień', 2: '2 dni', 5: '5 dni', 12: '12 dni', 22: '22 dni', 25: '25 dni' };
    await i18n.changeLanguage('en');
    for (const n of counts) expect(i18n.t('fertility.days', { defaultValue: '{{count}} days', count: n })).toBe(enExp[n]);
    await i18n.changeLanguage('pl');
    for (const n of counts) expect(i18n.t('fertility.days', { defaultValue: '{{count}} days', count: n })).toBe(plExp[n]);
  });

  test('fertility.daysPastOvulation pluralization (no unit interpolation)', async () => {
    const enExp: Record<number, string> = { 1: '1 day past ovulation', 2: '2 days past ovulation', 5: '5 days past ovulation' };
    const plExp: Record<number, string> = { 1: '1 dzień po owulacji', 2: '2 dni po owulacji', 5: '5 dni po owulacji', 12: '12 dni po owulacji', 22: '22 dni po owulacji', 25: '25 dni po owulacji' };
    await i18n.changeLanguage('en');
    for (const n of [1, 2, 5]) expect(i18n.t('fertility.daysPastOvulation', { defaultValue: '{{count}} days past ovulation', count: n })).toBe(enExp[n]);
    await i18n.changeLanguage('pl');
    for (const n of counts) expect(i18n.t('fertility.daysPastOvulation', { defaultValue: '{{count}} days past ovulation', count: n })).toBe(plExp[n]);
  });

  test('pregnancy.weekBanner.daysToGo (PL verb-inflected)', async () => {
    const plExp: Record<number, string> = { 1: 'Pozostał 1 dzień', 2: 'Pozostały 2 dni', 5: 'Pozostało 5 dni', 12: 'Pozostało 12 dni', 22: 'Pozostały 22 dni', 25: 'Pozostało 25 dni' };
    await i18n.changeLanguage('pl');
    for (const n of counts) expect(i18n.t('pregnancy.weekBanner.daysToGo', { defaultValue: '{{days}} days to go', days: String(n), count: n })).toBe(plExp[n]);
  });

  test('pregnancy.weekBanner.daysToGo EN', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('pregnancy.weekBanner.daysToGo', { defaultValue: '{{days}} days to go', days: '1', count: 1 })).toBe('1 day to go');
    expect(i18n.t('pregnancy.weekBanner.daysToGo', { defaultValue: '{{days}} days to go', days: '5', count: 5 })).toBe('5 days to go');
  });

  test('cycleCard.periodLate (PL, no raw day/days unit)', async () => {
    const plExp: Record<number, string> = { 1: 'Miesiączka spóźnia się o 1 dzień', 2: 'Miesiączka spóźnia się o 2 dni', 5: 'Miesiączka spóźnia się o 5 dni', 12: 'Miesiączka spóźnia się o 12 dni', 22: 'Miesiączka spóźnia się o 22 dni', 25: 'Miesiączka spóźnia się o 25 dni' };
    await i18n.changeLanguage('pl');
    for (const n of counts) expect(i18n.t('cycleCard.periodLate', { defaultValue: 'Period {{count}} day late', count: n })).toBe(plExp[n]);
  });

  test('cycleCard.daysToDue (PL)', async () => {
    const plExp: Record<number, string> = { 1: '1 dzień do terminu', 2: '2 dni do terminu', 5: '5 dni do terminu', 12: '12 dni do terminu', 22: '22 dni do terminu', 25: '25 dni do terminu' };
    await i18n.changeLanguage('pl');
    for (const n of counts) expect(i18n.t('cycleCard.daysToDue', { defaultValue: '{{count}} days to due date', count: n })).toBe(plExp[n]);
  });

  test('workoutComplete.labels.allSets (PL seria/serie/serii)', async () => {
    const plExp: Record<number, string> = { 1: '1 seria', 2: '2 serie', 5: '5 serii', 12: '12 serii', 22: '22 serie', 25: '25 serii' };
    await i18n.changeLanguage('pl');
    for (const n of [1, 2, 5, 12, 22, 25]) expect(i18n.t('workoutComplete.labels.allSets', { defaultValue: '{{count}} sets', count: n })).toBe(plExp[n]);
  });

  test('cycleHub ring Day/cycle localized (EN/PL)', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('cycleHub.ring.day', { defaultValue: 'Day {{day}}', day: 18 })).toBe('Day 18');
    expect(i18n.t('cycleHub.ring.dayCycle', { defaultValue: '{{count}}-day cycle', count: 28 })).toBe('28-day cycle');
    await i18n.changeLanguage('pl');
    expect(i18n.t('cycleHub.ring.day', { defaultValue: 'Day {{day}}', day: 18 })).toBe('Dzień 18');
    expect(i18n.t('cycleHub.ring.dayCycle', { defaultValue: '{{count}}-day cycle', count: 28 })).toBe('28-dniowy cykl');
  });

  test('medication cyclic schedule dual counts (PL)', async () => {
    const cases: [number, number, string][] = [
      [1, 1, '1 dzień stosowania, 1 dzień przerwy'],
      [2, 1, '2 dni stosowania, 1 dzień przerwy'],
      [1, 2, '1 dzień stosowania, 2 dni przerwy'],
      [2, 5, '2 dni stosowania, 5 dni przerwy'],
      [5, 2, '5 dni stosowania, 2 dni przerwy'],
    ];
    await i18n.changeLanguage('pl');
    for (const [on, off, expected] of cases) {
      const onText = i18n.t('medications.scheduleSummary.cycleOn', { defaultValue: '{{count}} days on', count: on });
      const offText = i18n.t('medications.scheduleSummary.cycleOff', { defaultValue: '{{count}} days off', count: off });
      const combined = i18n.t('medications.scheduleSummary.cycle', { defaultValue: '{{on}}, {{off}}', on: onText, off: offText });
      expect(combined).toBe(expected);
    }
  });
});

describe('baby development content (weeks 4-40)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('every week 4-40 has EN and PL comparison/baby/mom, PL != EN', async () => {
    await i18n.changeLanguage('en');
    const en: Record<number, { comparison: string; baby: string; mom: string }> = {};
    for (let w = 4; w <= 40; w++) {
      const v = localizeBabyWeek(w, i18n.t);
      expect(v).toBeTruthy();
      en[w] = v!;
    }
    await i18n.changeLanguage('pl');
    for (let w = 4; w <= 40; w++) {
      const v = localizeBabyWeek(w, i18n.t);
      expect(v).toBeTruthy();
      expect(v!.comparison.length).toBeGreaterThan(0);
      expect(v!.baby.length).toBeGreaterThan(0);
      expect(v!.mom.length).toBeGreaterThan(0);
      // PL presentation must not be the raw English fallback.
      expect(v!.comparison).not.toBe(en[w].comparison);
      expect(v!.baby).not.toBe(en[w].baby);
      expect(v!.mom).not.toBe(en[w].mom);
    }
  });

  test('curated PL final copy for reviewed weeks', async () => {
    await i18n.changeLanguage('pl');
    const w4 = localizeBabyWeek(4, i18n.t)!;
    expect(w4.mom).toBe('Miesiączka mogła się właśnie nie pojawić. Poziom hormonów ciążowych zaczyna rosnąć.');
    const w15 = localizeBabyWeek(15, i18n.t)!;
    expect(w15.baby).toBe('Dziecko wyczuwa światło, a jego ruchy wprawiają płyn owodniowy w ruch.');
    const w20 = localizeBabyWeek(20, i18n.t)!;
    expect(w20.comparison).toBe('Banan');
    const w25 = localizeBabyWeek(25, i18n.t)!;
    expect(w25.baby).toBe('Dziecku zaczynają rosnąć włosy, rozwija się odruch zaskoczenia.');
    const w28 = localizeBabyWeek(28, i18n.t)!;
    expect(w28.baby).toBe('Dziecko potrafi mrugać, a jego rzęsy są już w pełni wykształcone.');
    const w37 = localizeBabyWeek(37, i18n.t)!;
    expect(w37.baby).toBe('Dziecko jest już blisko terminu porodu (tzw. wczesny termin) i ćwiczy oddychanie.');
  });

  test('out-of-range week returns null', () => {
    expect(localizeBabyWeek(3, i18n.t)).toBeNull();
    expect(localizeBabyWeek(41, i18n.t)).toBeNull();
  });

  test('fractional length uses locale decimal separator', async () => {
    await i18n.changeLanguage('en');
    expect(formatBabyLength(1.6)).toBe('1.6 cm');
    await i18n.changeLanguage('pl');
    expect(formatBabyLength(1.6)).toBe('1,6 cm');
  });
});

describe('pregnancy safety content', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  test('every FOOD_SAFETY and MED_SAFETY item has EN and PL name/note (PL != EN)', async () => {
    await i18n.changeLanguage('en');
    const lists: [typeof FOOD_SAFETY, 'food' | 'med'][] = [
      [FOOD_SAFETY, 'food'],
      [MED_SAFETY, 'med'],
    ];
    const enSnapshot: { name: string; note: string }[] = [];
    for (const [list, group] of lists) {
      for (const item of list) {
        const name = localizeSafetyName(item, group, i18n.t);
        const note = localizeSafetyNote(item, group, i18n.t);
        expect(item.key).toBeTruthy();
        expect(name.length).toBeGreaterThan(0);
        expect(note.length).toBeGreaterThan(0);
        enSnapshot.push({ name, note });
      }
    }
    await i18n.changeLanguage('pl');
    let i = 0;
    for (const [list, group] of lists) {
      for (const item of list) {
        const name = localizeSafetyName(item, group, i18n.t);
        const note = localizeSafetyNote(item, group, i18n.t);
        expect(name.length).toBeGreaterThan(0);
        expect(note.length).toBeGreaterThan(0);
        // PL must not fall through to raw English app-owned copy. Some drug
        // names are internationally recognized brands (Ibuprofen (Advil)) and
        // legitimately stay identical; the app-owned note must always differ.
        expect(note).not.toBe(enSnapshot[i].note);
        i++;
      }
    }
  });

  test('canonical EN search resolves the exact controlled keys', async () => {
    const salmonKeys = lookupSafetyLocalized('salmon', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(salmonKeys).toContain('cooked_salmon');
    const rawFishKeys = lookupSafetyLocalized('raw fish', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(rawFishKeys).toContain('sushi_raw');
    const softCheeseKeys = lookupSafetyLocalized('soft cheese', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(softCheeseKeys).toContain('soft_cheese_unpasteurized');
  });

  test('Polish search resolves the exact controlled keys (łosoś, ser, paracetamol)', async () => {
    await i18n.changeLanguage('pl');
    const lososKeys = lookupSafetyLocalized('łosoś', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(lososKeys).toContain('cooked_salmon');
    const serKeys = lookupSafetyLocalized('ser miękki', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(serKeys).toContain('soft_cheese_unpasteurized');
    const paracetamolKeys = lookupSafetyLocalized('paracetamol', MED_SAFETY, 'med', i18n.t).map((i) => i.key);
    expect(paracetamolKeys).toContain('acetaminophen');
    // 'surowa ryba' must resolve to sushi_raw, NOT undercooked_meat.
    const surowaRyba = lookupSafetyLocalized('surowa ryba', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(surowaRyba).toContain('sushi_raw');
    expect(surowaRyba).not.toContain('undercooked_meat');
    // 'nimesulid' must NOT resolve to ibuprofen (it is a different drug).
    const nimesulidKeys = lookupSafetyLocalized('nimesulid', MED_SAFETY, 'med', i18n.t).map((i) => i.key);
    expect(nimesulidKeys).not.toContain('ibuprofen');
  });

  test("Polish alias 'makrela królewska' resolves to swordfish", async () => {
    await i18n.changeLanguage('pl');
    expect(lookupSafetyLocalized('makrela królewska', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key)).toContain('swordfish');
  });

  test('longer natural Polish queries resolve precise controlled keys', async () => {
    await i18n.changeLanguage('pl');
    const rawQuery = lookupSafetyLocalized('czy mogę jeść surową rybę', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(rawQuery).toContain('sushi_raw');
    expect(rawQuery).not.toContain('undercooked_meat');
    const ibuQuery = lookupSafetyLocalized('czy ibuprofen jest bezpieczny', MED_SAFETY, 'med', i18n.t).map((i) => i.key);
    expect(ibuQuery).toContain('ibuprofen');
    const softCheeseQuery = lookupSafetyLocalized('mam ser miękki niepasteryzowany', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(softCheeseQuery).toContain('soft_cheese_unpasteurized');
  });

  test('broad category words do not imply any specific controlled item', async () => {
    await i18n.changeLanguage('pl');
    // 'ryba' must not imply cooked_salmon or sushi_raw from the generic word.
    const ryba = lookupSafetyLocalized('ryba', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(ryba).not.toContain('cooked_salmon');
    expect(ryba).not.toContain('sushi_raw');
    // 'ser' must not imply a specific cheese item (hard_cheese / soft_cheese).
    const ser = lookupSafetyLocalized('ser', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(ser).not.toContain('hard_cheese');
    expect(ser).not.toContain('soft_cheese_unpasteurized');
    // 'mięso' must not imply a specific meat item from the generic word.
    const mieso = lookupSafetyLocalized('mięso', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(mieso).not.toContain('undercooked_meat');
    expect(mieso).not.toContain('deli_meat_cold');
  });

  test('precise Polish queries resolve their exact controlled keys (positive and negative)', async () => {
    await i18n.changeLanguage('pl');
    const twardy = lookupSafetyLocalized('ser twardy', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(twardy).toContain('hard_cheese');
    expect(twardy).not.toContain('soft_cheese_unpasteurized');
    const miekkie = lookupSafetyLocalized('ser miękki', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(miekkie).toContain('soft_cheese_unpasteurized');
    expect(miekkie).not.toContain('hard_cheese');
    const surowaRyba = lookupSafetyLocalized('surowa ryba', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(surowaRyba).toContain('sushi_raw');
    expect(surowaRyba).not.toContain('undercooked_meat');
    const niedogotowane = lookupSafetyLocalized('niedogotowane mięso', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(niedogotowane).toContain('undercooked_meat');
    const losos = lookupSafetyLocalized('łosoś', FOOD_SAFETY, 'food', i18n.t).map((i) => i.key);
    expect(losos).toContain('cooked_salmon');
  });

  test('brand aliases work (Tylenol, Advil, Benadryl)', async () => {
    expect(lookupSafetyLocalized('Tylenol', MED_SAFETY, 'med', i18n.t).length).toBeGreaterThan(0);
    expect(lookupSafetyLocalized('Advil', MED_SAFETY, 'med', i18n.t).length).toBeGreaterThan(0);
    expect(lookupSafetyLocalized('Benadryl', MED_SAFETY, 'med', i18n.t).length).toBeGreaterThan(0);
  });
});
