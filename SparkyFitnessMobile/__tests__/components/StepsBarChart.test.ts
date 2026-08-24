import i18n, { initializeI18n } from '../../src/localization/i18n';
import { buildTooltipText } from '../../src/components/StepsBarChart';
import type { StepsDataPoint } from '../../src/hooks/useMeasurementsRange';

const point: StepsDataPoint = {
  day: '2026-06-03',
  steps: 5000,
};

describe('StepsBarChart buildTooltipText (locale-aware)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('derives the tooltip copy from the active application locale', async () => {
    await i18n.changeLanguage('en');
    // i18next returns June as a weekday/month so the date portion is EN short.
    const enText = buildTooltipText(point, i18n.t);
    expect(enText).toContain('steps');

    await i18n.changeLanguage('pl');
    // The same point rendered under PL must use the Polish step word.
    const plText = buildTooltipText(point, i18n.t);
    expect(plText).toContain('kroków');

    // Rebuilding under PL must differ from the EN copy (no stale English).
    expect(plText).not.toBe(enText);

    await i18n.changeLanguage('en');
  });
});
