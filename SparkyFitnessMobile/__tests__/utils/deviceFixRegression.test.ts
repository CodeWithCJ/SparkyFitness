import i18n, { initializeI18n } from '../../src/localization/i18n';
import {
  resolveCalendarPresentation,
  appLocaleToDatepickerLocale,
} from '../../src/utils/calendarLocalization';
import { getMealTypeDisplayLabel, getMealGroupLabel } from '../../src/utils/mealNutrition';
import type { MealType } from '../../src/types/mealTypes';

describe('device-testing fix regression (calendar + meal types)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  describe('calendar locale (app language, not device locale)', () => {
    test('PL app language resolves the dayjs pl locale', () => {
      expect(appLocaleToDatepickerLocale('pl-PL')).toBe('pl');
      expect(resolveCalendarPresentation('pl-PL').locale).toBe('pl');
    });

    test('EN app language resolves the dayjs en locale', () => {
      expect(appLocaleToDatepickerLocale('en-US')).toBe('en');
      expect(resolveCalendarPresentation('en-US').locale).toBe('en');
    });
  });

  describe('calendar week-start (account preference, independent of locale)', () => {
    test('PL + Monday preference -> pl locale, Monday (1) first', () => {
      const p = resolveCalendarPresentation('pl-PL', 1);
      expect(p.locale).toBe('pl');
      expect(p.firstDayOfWeek).toBe(1);
    });

    test('PL + Sunday preference -> pl locale, Sunday (0) first', () => {
      const p = resolveCalendarPresentation('pl-PL', 0);
      expect(p.locale).toBe('pl');
      expect(p.firstDayOfWeek).toBe(0);
    });

    test('EN + Monday preference -> en locale, Monday (1) first', () => {
      const p = resolveCalendarPresentation('en-US', 1);
      expect(p.locale).toBe('en');
      expect(p.firstDayOfWeek).toBe(1);
    });

    test('EN + Sunday preference -> en locale, Sunday (0) first', () => {
      const p = resolveCalendarPresentation('en-US', 0);
      expect(p.locale).toBe('en');
      expect(p.firstDayOfWeek).toBe(0);
    });

    test('fallback when preference is unavailable defaults to Sunday (0)', () => {
      const p = resolveCalendarPresentation('pl-PL', undefined);
      expect(p.firstDayOfWeek).toBe(0);
      expect(resolveCalendarPresentation('pl-PL', null as unknown as number).firstDayOfWeek).toBe(0);
      expect(resolveCalendarPresentation('pl-PL', 7).firstDayOfWeek).toBe(0);
      expect(resolveCalendarPresentation('pl-PL', -1).firstDayOfWeek).toBe(0);
    });
  });

  describe('system meal-type localization', () => {
    const system = (name: string): MealType => ({
      id: `sys-${name}`,
      name,
      sort_order: 0,
      user_id: null,
      created_at: '',
      is_visible: true,
      show_in_quick_log: true,
    });

    test('EN system meal types render approved English labels', async () => {
      await i18n.changeLanguage('en');
      const systemTypes: [string, string][] = [
        ['breakfast', 'Breakfast'],
        ['lunch', 'Lunch'],
        ['dinner', 'Dinner'],
        ['snacks', 'Snacks'],
        ['snack', 'Snacks'],
        ['other', 'Other'],
      ];
      for (const [raw, expected] of systemTypes) {
        expect(getMealTypeDisplayLabel(system(raw), i18n.t)).toBe(expected);
        expect(getMealGroupLabel({ name: raw, isSystem: true, mealTypeId: null, sortOrder: 0, entries: [] }, i18n.t)).toBe(expected);
      }
    });

    test('PL system meal types render approved Polish labels', async () => {
      await i18n.changeLanguage('pl');
      const systemTypes: [string, string][] = [
        ['breakfast', 'Śniadanie'],
        ['lunch', 'Obiad'],
        ['dinner', 'Kolacja'],
        ['snacks', 'Przekąski'],
        ['snack', 'Przekąski'],
        ['other', 'Inne'],
      ];
      for (const [raw, expected] of systemTypes) {
        expect(getMealTypeDisplayLabel(system(raw), i18n.t)).toBe(expected);
        expect(getMealGroupLabel({ name: raw, isSystem: true, mealTypeId: null, sortOrder: 0, entries: [] }, i18n.t)).toBe(expected);
      }
    });

    test('custom meal type renders its literal name (not translated)', async () => {
      await i18n.changeLanguage('pl');
      const custom: MealType = {
        id: 'custom-1',
        name: 'Posiłek po treningu',
        sort_order: 5,
        user_id: 'user-1',
        created_at: '',
        is_visible: true,
        show_in_quick_log: true,
      };
      expect(getMealTypeDisplayLabel(custom, i18n.t)).toBe('Posiłek po treningu');
      // A custom type named like a system key must stay literal.
      const customBreakfast: MealType = { ...custom, name: 'breakfast' };
      expect(getMealTypeDisplayLabel(customBreakfast, i18n.t)).toBe('breakfast');
    });

    test('raw canonical value is not mutated', async () => {
      await i18n.changeLanguage('pl');
      const mt = system('breakfast');
      getMealTypeDisplayLabel(mt, i18n.t);
      expect(mt.name).toBe('breakfast');
      expect(mt.user_id).toBeNull();
    });
  });
});
