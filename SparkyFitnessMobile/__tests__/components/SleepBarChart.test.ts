import i18n, { initializeI18n } from '../../src/localization/i18n';
import { buildSleepTooltipText } from '../../src/components/SleepBarChart';
import { formatTooltipDate } from '../../src/components/charts/chartFormatting';
import type { SleepDataPoint } from '../../src/types/sleep';

const point: SleepDataPoint = {
  day: '2026-06-03',
  hours: 7.5,
};

describe('SleepBarChart buildSleepTooltipText (locale-aware)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('returns empty copy for an undefined point', () => {
    // The tooltip slot reserves layout height even with nothing selected, so the
    // no-selection state must render as empty rather than as a placeholder string.
    expect(buildSleepTooltipText(undefined, i18n.t)).toBe('');
  });

  test('renders hours and the localized date under EN', async () => {
    await i18n.changeLanguage('en');

    const text = buildSleepTooltipText(point, i18n.t);

    expect(text).toContain('7.5');
    expect(text).toContain('h');
    expect(text).toContain(formatTooltipDate(point.day));
  });

  test('rebuilds the copy after a runtime language switch', async () => {
    await i18n.changeLanguage('en');
    const enText = buildSleepTooltipText(point, i18n.t);

    await i18n.changeLanguage('pl');
    const plText = buildSleepTooltipText(point, i18n.t);

    // The hours unit is `{{formattedHours}} h` in both catalogs, so the observable
    // difference is the locale-formatted number and date, not a translated word.
    expect(enText).toContain('7.5');
    expect(plText).toContain('7,5');
    expect(plText).not.toBe(enText);

    await i18n.changeLanguage('en');
  });

  test('renders a zero-sleep day as 0, not as empty copy', async () => {
    await i18n.changeLanguage('en');

    const text = buildSleepTooltipText({ day: '2026-06-03', hours: 0 }, i18n.t);

    expect(text).not.toBe('');
    expect(text).toContain('0');
  });

  test('rounds fractional hours to the displayed precision', async () => {
    await i18n.changeLanguage('en');

    // 27300 s = 7.58333… h; the tooltip shows one decimal, never the float tail.
    const text = buildSleepTooltipText({ day: '2026-06-03', hours: 27300 / 3600 }, i18n.t);

    expect(text).toContain('7.6');
    expect(text).not.toContain('7.58');
  });
});
