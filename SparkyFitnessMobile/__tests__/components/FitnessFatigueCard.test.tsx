import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type {
  FitnessFatigue,
  Readiness,
  FitnessFatigueResponse,
} from '@workspace/shared';
import FitnessFatigueCard from '../../src/components/exerciseStats/FitnessFatigueCard';
import { initializeI18n } from '../../src/localization/i18n';

const points = Array.from({ length: 40 }, (_, i) => ({
  day: `2026-09-${String((i % 28) + 1).padStart(2, '0')}-${i}`,
  load: 50,
  fitness: 40,
  fatigue: 30,
  form: i % 2 === 0 ? 10 : -10,
}));

const response = (
  readiness: Partial<Readiness> = {},
  fitnessFatigue: Partial<FitnessFatigue> = {}
): FitnessFatigueResponse => ({
  fitnessFatigue: {
    points,
    today: points[points.length - 1] ?? null,
    status: 'fresh',
    ...fitnessFatigue,
  },
  readiness: {
    score: 82,
    level: 'high',
    factors: { form: 90, sleep: 75 },
    weakest: null,
    ...readiness,
  },
});

beforeAll(async () => {
  await initializeI18n('en');
});

test('shows the score, its verdict, the factors and the last four weeks of form', () => {
  render(
    <FitnessFatigueCard data={response()} isLoading={false} isError={false} />
  );
  expect(screen.getByText('82')).toBeTruthy();
  expect(screen.getByText(/Ready for a hard session/)).toBeTruthy();
  expect(screen.getByText('Training form')).toBeTruthy();
  expect(screen.getByText('Sleep')).toBeTruthy();
  expect(screen.getAllByTestId('form-bar')).toHaveLength(28);
  expect(screen.getByText(/Fresh:/)).toBeTruthy();
});

test('points to an easy day when readiness is low', () => {
  render(
    <FitnessFatigueCard
      data={response(
        { score: 30, level: 'low', weakest: 'sleep' },
        { status: 'tired' }
      )}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.getByText(/easy day or rest/)).toBeTruthy();
  expect(screen.getByText(/Tired:/)).toBeTruthy();
});

test('explains there is nothing to go on yet', () => {
  render(
    <FitnessFatigueCard
      data={response(
        { score: null, level: 'noData', factors: {} },
        { points: [], today: null, status: 'noData' }
      )}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.getByText('–')).toBeTruthy();
  expect(screen.getByText(/Not enough to go on yet/)).toBeTruthy();
  expect(screen.queryAllByTestId('form-bar')).toHaveLength(0);
});

test('reports a failed load', () => {
  render(
    <FitnessFatigueCard data={undefined} isLoading={false} isError={true} />
  );
  expect(screen.getByText('Could not load your readiness.')).toBeTruthy();
});

test('shows the HRV reading against the usual one and omits it from older servers', () => {
  const { rerender } = render(
    <FitnessFatigueCard
      data={response({
        factors: { form: 90, hrv: 0 },
        vitals: { hrv: { current: 41, baseline: 68, nights: 9 } },
      })}
      isLoading={false}
      isError={false}
    />
  );
  expect(
    screen.getByText('41 ms against your usual 68 ms (median of 9 nights)')
  ).toBeTruthy();

  rerender(
    <FitnessFatigueCard
      data={response({ factors: { form: 90, hrv: 0 } })}
      isLoading={false}
      isError={false}
    />
  );
  expect(screen.queryByText(/against your usual/)).toBeNull();
});
