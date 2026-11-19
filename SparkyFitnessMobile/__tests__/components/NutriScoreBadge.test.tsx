import { render, screen } from '@testing-library/react-native';
import NutriScoreBadge from '../../src/components/NutriScoreBadge';
import { initializeI18n } from '../../src/localization/i18n';

beforeAll(() => initializeI18n());

test('labels a computed grade as calculated, not as Open Food Facts', () => {
  render(
    <NutriScoreBadge
      nutriScore={{ grade: 'c', score: 4, source: 'computed' }}
    />
  );

  expect(
    screen.getByLabelText('Nutri-Score C (calculated from nutrients)')
  ).toBeTruthy();
});

test('labels a trusted provider grade as Open Food Facts', () => {
  render(
    <NutriScoreBadge
      nutriScore={{ grade: 'a', score: null, source: 'provider' }}
    />
  );

  expect(
    screen.getByLabelText('Nutri-Score A (from Open Food Facts)')
  ).toBeTruthy();
});
