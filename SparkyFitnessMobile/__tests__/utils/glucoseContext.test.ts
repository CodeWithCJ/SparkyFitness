import {
  loadGlucoseContext,
  glucoseContextForDay,
  type GlucoseContextEvent,
} from '@workspace/shared';

const readWith =
  (overrides: Record<string, unknown> = {}) =>
  async <T>(path: string): Promise<T> => {
    if (path in overrides) {
      const result = overrides[path];
      if (result instanceof Error) throw result;
      return result as T;
    }
    if (path.startsWith('/daily-summary'))
      return { foodEntries: [], exerciseSessions: [], waterIntake: 0 } as T;
    if (path.startsWith('/generic-health')) return { data: [] } as T;
    return [] as T;
  };
const day = '2026-11-04';
const zone = 'America/New_York';

test('captures all requested context and scales food nutrient snapshots by consumed quantity', async () => {
  const data = await loadGlucoseContext(
    readWith({
      '/daily-summary?date=2026-11-04': {
        foodEntries: [
          {
            id: 'coffee',
            entry_date: day,
            entry_time: '10:00',
            food_name: 'Coffee and breakfast',
            serving_size: 100,
            quantity: 200,
            carbs: 10,
            caffeine_mg: 50,
            alcohol_g: 2,
          },
        ],
        exerciseSessions: [],
        waterIntake: 750,
      },
      '/daily-summary?date=2026-11-03': {
        foodEntries: [],
        waterIntake: 0,
        exerciseSessions: [
          {
            id: 'run',
            type: 'individual',
            name: 'Run',
            entry_time: '23:30',
            duration_minutes: 90,
          },
        ],
      },
      '/sleep?startDate=2026-11-03&endDate=2026-11-05': [
        {
          id: 'sleep',
          entry_date: day,
          bedtime: '2026-11-04T03:00:00Z',
          wake_time: '2026-11-04T11:00:00Z',
        },
      ],
      '/v2/medications/entries?fromDate=2026-11-03&toDate=2026-11-05': [
        {
          id: 'taken',
          entry_date: day,
          status: 'taken',
          taken_at: '2026-11-04T15:05:00Z',
          scheduled_for: '2026-11-04T14:00:00Z',
          med_name_snapshot: 'Recorded medication',
          dose_amount_snapshot: 0.25,
          dose_unit_snapshot: 'mg',
        },
        {
          id: 'skipped',
          entry_date: day,
          status: 'skipped',
          taken_at: '2026-11-04T14:00:00Z',
        },
      ],
      '/generic-health/samples?metric=stress&startDate=2026-11-04&endDate=2026-11-04':
        {
          data: [
            {
              metric: 'stress',
              source_provider: 'watch',
              entry_date: day,
              samples: [{ t: '2026-11-04T15:00:00Z', level: 30 }],
            },
          ],
        },
    }),
    day,
    zone
  );
  expect(new Set(data.events.map((event) => event.kind))).toEqual(
    new Set([
      'meal',
      'caffeine',
      'alcohol',
      'exercise',
      'sleep',
      'medication',
      'stress',
      'hydration',
    ])
  );
  expect(data.events.find((event) => event.kind === 'caffeine')?.value).toBe(
    100
  );
  expect(data.events.find((event) => event.kind === 'meal')?.value).toBe(20);
  expect(data.events.find((event) => event.kind === 'medication')?.start).toBe(
    '2026-11-04T15:05:00Z'
  );
  expect(data.events.some((event) => event.id === 'medication:skipped')).toBe(
    false
  );
  const events = glucoseContextForDay(data, day, zone);
  expect(events.find((event) => event.kind === 'exercise')).toMatchObject({
    start: '2026-11-04T04:30:00.000Z',
    end: '2026-11-04T06:00:00.000Z',
    minutes: 0,
    endMinutes: 60,
  });
  expect(events.find((event) => event.kind === 'sleep')).toMatchObject({
    minutes: 0,
    endMinutes: 360,
  });
  expect(events.find((event) => event.kind === 'hydration')).toMatchObject({
    minutes: null,
    value: 750,
  });
});

test('a forbidden medication layer is reported while other layers remain usable', async () => {
  const data = await loadGlucoseContext(
    readWith({
      '/v2/medications/entries?fromDate=2026-11-03&toDate=2026-11-05':
        new Error('403'),
      '/daily-summary?date=2026-11-04': {
        foodEntries: [{ id: 'f', entry_date: day, food_name: 'Untimed meal' }],
        exerciseSessions: [],
        waterIntake: 500,
      },
    }),
    day,
    zone
  );
  expect(data.unavailable).toEqual(['medication']);
  expect(
    glucoseContextForDay(data, day, zone).find((event) => event.kind === 'meal')
      ?.minutes
  ).toBeNull();
});

test('clips recorded spans at day boundaries without changing their actual end timestamps', () => {
  const events: GlucoseContextEvent[] = [
    {
      id: 'late',
      kind: 'exercise',
      day,
      start: '2026-11-05T04:30:00Z',
      end: '2026-11-05T06:00:00Z',
      label: 'Late walk',
    },
  ];
  expect(
    glucoseContextForDay({ events, unavailable: [] }, day, zone)[0]
  ).toMatchObject({
    minutes: 1410,
    endMinutes: 1440,
    end: '2026-11-05T06:00:00Z',
  });
});

test('keeps an exercise span accurate through a daylight-saving clock change', () => {
  const events: GlucoseContextEvent[] = [
    {
      id: 'dst',
      kind: 'exercise',
      day: '2026-10-25',
      start: '2026-10-24T23:30:00Z',
      end: '2026-10-25T01:30:00Z',
    },
  ];
  const item = glucoseContextForDay(
    { events, unavailable: [] },
    '2026-10-25',
    'Europe/Berlin'
  )[0]!;
  expect(item.endMinutes! - item.minutes!).toBe(120);
});
