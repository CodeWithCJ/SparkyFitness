import i18n, { initializeI18n } from '../../src/localization/i18n';
import { getAppLocale } from '../../src/localization';
import { formatDate } from '../../src/utils/dateUtils';
import {
  resolveCalendarPresentation,
  appLocaleToDatepickerLocale,
  getCalendarWeekdayShortNames,
  getCalendarMonthNames,
} from '../../src/utils/calendarLocalization';

describe('runtime app-language reactivity (PL <-> EN without restart)', () => {
  beforeAll(async () => {
    await initializeI18n('pl');
    await i18n.changeLanguage('pl');
  });

  afterEach(async () => {
    await i18n.changeLanguage('pl');
  });

  const FIXED_DATE = '2026-08-20';

  test('Dashboard date header re-localizes on live language change', async () => {
    // Initial PL presentation (matches the physical-device observation).
    await i18n.changeLanguage('pl');
    expect(getAppLocale()).toBe('pl-PL');
    expect(formatDate(FIXED_DATE, getAppLocale())).toBe('czw., 20 sie');

    // Switch to EN live (no app restart).
    await i18n.changeLanguage('en');
    expect(getAppLocale()).toBe('en-US');
    expect(formatDate(FIXED_DATE, getAppLocale())).toBe('Thu, Aug 20');

    // Switch back to PL.
    await i18n.changeLanguage('pl');
    expect(formatDate(FIXED_DATE, getAppLocale())).toBe('czw., 20 sie');
  });

  test('CalendarSheet datepicker locale maps the app language', () => {
    expect(appLocaleToDatepickerLocale('pl-PL')).toBe('pl');
    expect(appLocaleToDatepickerLocale('en-US')).toBe('en');
  });

  test('CalendarSheet presentation switches locale live while preserving week-start', async () => {
    // Account week start = Monday (1) regardless of app language.
    const mondayPref = 1;

    await i18n.changeLanguage('pl');
    const pl = resolveCalendarPresentation(getAppLocale(), mondayPref);
    expect(pl.locale).toBe('pl');
    expect(pl.firstDayOfWeek).toBe(1);

    await i18n.changeLanguage('en');
    const en = resolveCalendarPresentation(getAppLocale(), mondayPref);
    expect(en.locale).toBe('en');
    // Week start preference is independent of language: stays Monday.
    expect(en.firstDayOfWeek).toBe(1);

    await i18n.changeLanguage('pl');
    const plAgain = resolveCalendarPresentation(getAppLocale(), mondayPref);
    expect(plAgain.locale).toBe('pl');
    expect(plAgain.firstDayOfWeek).toBe(1);
  });

  test('CalendarSheet presentation preserves Sunday week-start across languages', async () => {
    await i18n.changeLanguage('pl');
    expect(resolveCalendarPresentation(getAppLocale(), 0).firstDayOfWeek).toBe(0);
    await i18n.changeLanguage('en');
    expect(resolveCalendarPresentation(getAppLocale(), 0).firstDayOfWeek).toBe(0);
  });

  test('CalendarSheet falls back to Sunday (0) when preference is unavailable', async () => {
    await i18n.changeLanguage('en');
    expect(resolveCalendarPresentation(getAppLocale(), undefined).firstDayOfWeek).toBe(0);
    await i18n.changeLanguage('pl');
    expect(resolveCalendarPresentation(getAppLocale(), undefined).firstDayOfWeek).toBe(0);
  });
});


describe('calendar grid visible labels (app-locale driven, live switch)', () => {
  beforeAll(async () => {
    await initializeI18n('pl');
    await i18n.changeLanguage('pl');
  });

  test('month names re-localize live: PL sierpień -> EN August -> PL sierpień', async () => {
    await i18n.changeLanguage('pl');
    const plMonths = getCalendarMonthNames(getAppLocale());
    expect(plMonths[7]).toMatch(/^sierpień$/i);

    await i18n.changeLanguage('en');
    const enMonths = getCalendarMonthNames(getAppLocale());
    expect(enMonths[7]).toMatch(/august/i);

    await i18n.changeLanguage('pl');
    expect(getCalendarMonthNames(getAppLocale())[7]).toMatch(/^sierpień$/i);
  });

  test('weekday short names re-localize live and are Sunday-indexed', async () => {
    await i18n.changeLanguage('pl');
    const plWeekdays = getCalendarWeekdayShortNames(getAppLocale());
    expect(plWeekdays[0].length).toBeGreaterThan(0);
    expect(plWeekdays[1]).not.toBe(plWeekdays[0]);

    await i18n.changeLanguage('en');
    const enWeekdays = getCalendarWeekdayShortNames(getAppLocale());
    expect(enWeekdays[1].toLowerCase()).toBe('mon');
  });
});
