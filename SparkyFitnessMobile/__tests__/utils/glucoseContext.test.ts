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
      '/v2/measurements/water-intake/2026-11-04/log': [
        {
          id: 'glass',
          entry_date: day,
          logged_at: '2026-11-04T15:30:00Z',
          water_ml: 250,
        },
      ],
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
      '/generic-health/samples?metric=stress&startDate=2026-11-02&endDate=2026-11-06':
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
  expect(events.find((event) => event.id === 'drink:glass')).toMatchObject({
    start: '2026-11-04T15:30:00Z',
    minutes: 630,
    value: 250,
  });
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
  expect(
    events.find(
      (event) => event.kind === 'hydration' && event.summary === 'total'
    )
  ).toMatchObject({
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

test('reads stress from neighboring stored buckets and filters by the current timezone day', async () => {
  const read = jest.fn(
    readWith({
      '/generic-health/samples?metric=stress&startDate=2026-10-31&endDate=2026-11-04':
        {
          data: [
            {
              metric: 'stress',
              entry_date: '2026-11-04',
              source_provider: 'watch',
              samples: [
                { t: '2026-11-03T10:30:00Z', level: 35 },
                { t: '2026-11-04T10:30:00Z', level: 40 },
              ],
            },
          ],
        },
    })
  );
  const data = await loadGlucoseContext(read, '2026-11-02', 'Etc/GMT+12');
  const events = glucoseContextForDay(data, '2026-11-02', 'Etc/GMT+12');
  expect(events.filter((event) => event.kind === 'stress')).toHaveLength(1);
  expect(events[0]).toMatchObject({
    start: '2026-11-03T10:30:00Z',
    minutes: 1350,
    value: 35,
  });
});

test('reports partial stress failures while retaining successful observations', async () => {
  const data = await loadGlucoseContext(
    readWith({
      '/generic-health/samples?metric=stress&startDate=2026-11-02&endDate=2026-11-06':
        new Error('403'),
      '/generic-health/metrics?startDate=2026-11-04&endDate=2026-11-04': {
        data: [{ avg_stress_level: 35, source_provider: 'watch' }],
      },
    }),
    day,
    zone
  );
  expect(data.unavailable).toContain('stress');
  expect(data.events.find((event) => event.kind === 'stress')).toMatchObject({
    value: 35,
  });
});

test('sorts late observations before untimed totals on a 25-hour day', () => {
  const data = {
    unavailable: [],
    events: [
      { id: 'total', kind: 'hydration' as const, day: '2026-11-01' },
      {
        id: 'late',
        kind: 'meal' as const,
        day: '2026-11-01',
        start: '2026-11-02T04:30:00Z',
      },
    ],
  };
  const events = glucoseContextForDay(data, '2026-11-01', 'America/New_York');
  expect(events.map((event) => event.id)).toEqual(['late', 'total']);
  expect(events[0]?.minutes).toBe(1470);
});
