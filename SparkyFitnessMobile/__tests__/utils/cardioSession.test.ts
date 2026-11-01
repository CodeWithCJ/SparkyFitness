import type {
  ExerciseEntryHrZones,
  GpsTrackPoint,
  IndividualSessionResponse,
} from '@workspace/shared';
import {
  cardioSessionFromDiaryEntry,
  gpsHeartRateSeries,
  combinedHeartRateZoneRows,
  heartRateZoneRows,
  paceSeriesFromDistance,
  paceSeriesFromTrack,
  projectRoute,
  routeRegion,
  usableRoutePoints,
  splitsFromTrack,
} from '../../src/utils/cardioSession';

const point = (lat: number, lon: number, t = '2026-09-20T12:00:00Z') =>
  ({ t, lat, lon }) as GpsTrackPoint;

describe('projectRoute', () => {
  it('fits the track in the box with padding and keeps its aspect', () => {
    const route = projectRoute(
      [point(0.001, 0.001), point(0.002, 0.001), point(0.002, 0.003)],
      200,
      100,
      10
    );
    expect(route).not.toBeNull();
    const coords = route!.d
      .split(' ')
      .map((part) => part.slice(1).split(',').map(Number));
    for (const [x, y] of coords) {
      expect(x).toBeGreaterThanOrEqual(10 - 0.1);
      expect(x).toBeLessThanOrEqual(190 + 0.1);
      expect(y).toBeGreaterThanOrEqual(10 - 0.1);
      expect(y).toBeLessThanOrEqual(90 + 0.1);
    }
    // North is up: the later, more northern point sits higher.
    expect(route!.end.y).toBeLessThan(route!.start.y);
  });

  it('ignores 0,0 fixes and needs two usable points', () => {
    expect(projectRoute([point(0, 0), point(51.5, -0.1)], 200, 100)).toBeNull();
    expect(projectRoute([], 200, 100)).toBeNull();
  });

  it('draws a track that never moves as a dot in the middle', () => {
    const route = projectRoute(
      [point(51.5, -0.1), point(51.5, -0.1)],
      200,
      100,
      10
    );
    expect(route!.start).toEqual({ x: 100, y: 50 });
  });
});

describe('usableRoutePoints', () => {
  it('drops 0,0 and non-finite fixes and keeps order', () => {
    expect(
      usableRoutePoints([
        point(0, 0),
        point(51.5, -0.1),
        point(Number.NaN, 1),
        point(51.6, -0.2),
      ])
    ).toEqual([point(51.5, -0.1), point(51.6, -0.2)]);
  });

  it('drops fixes off the globe', () => {
    expect(
      usableRoutePoints([
        point(91, 0.5),
        point(51.5, -0.1),
        point(51.6, 181),
        point(51.6, -0.2),
      ])
    ).toEqual([point(51.5, -0.1), point(51.6, -0.2)]);
  });

  it('thins a long track and keeps its last point', () => {
    const track = Array.from({ length: 4000 }, (_, i) =>
      point(51 + i / 10000, 0.5)
    );
    const kept = usableRoutePoints(track);
    expect(kept.length).toBeLessThanOrEqual(1500);
    expect(kept[kept.length - 1]).toBe(track[track.length - 1]);
  });
});

describe('routeRegion', () => {
  it('centers on the route with a margin around it', () => {
    expect(routeRegion([point(51.5, -0.2), point(51.6, -0.1)])).toEqual({
      latitude: expect.closeTo(51.55),
      longitude: expect.closeTo(-0.15),
      latitudeDelta: expect.closeTo(0.13),
      longitudeDelta: expect.closeTo(0.13),
    });
  });

  it('frames a route over the date line narrowly, not around the globe', () => {
    const region = routeRegion([point(-17, 179.9), point(-17.1, -179.9)]);
    // ±180 is the same meridian.
    expect(Math.abs(region?.longitude ?? 0)).toBeCloseTo(180);
    expect(region?.longitudeDelta).toBeCloseTo(0.26);
  });

  it('frames the shortest arc when the points spread over the globe', () => {
    // Both the plain and the date-line span are 340°; the points leave a
    // 150° gap between -160 and -10, so they fit in 210°, from -10 east
    // through 170 to -160.
    const region = routeRegion(
      [-170, -160, -10, 10, 20, 170].map((lon) => point(10, lon))
    );
    expect(region?.longitudeDelta).toBeCloseTo(210 * 1.3);
    expect(region?.longitude).toBeCloseTo(95);
  });

  it('keeps the spans under a full turn for a route around the globe', () => {
    // A 288° arc plus the margin would be 374°; at 360° the region's edges
    // are one meridian and the map cannot fit it.
    const region = routeRegion(
      [-144, -72, 0, 72, 144].map((lon) => point(lon / 2, lon))
    );
    expect(region?.longitudeDelta).toBeLessThan(360);
    expect(region?.latitudeDelta).toBeLessThan(180);
  });

  it("keeps an ordinary route's plain span", () => {
    const region = routeRegion([point(51.5, -0.2), point(51.6, 0.1)]);
    expect(region?.longitude).toBeCloseTo(-0.05);
    expect(region?.longitudeDelta).toBeCloseTo(0.39);
  });

  it('keeps some context around a track that barely moves', () => {
    const region = routeRegion([point(51.5, -0.1), point(51.5, -0.1)]);
    expect(region?.latitudeDelta).toBe(0.002);
    expect(region?.longitudeDelta).toBe(0.002);
  });

  it('needs two usable points', () => {
    expect(routeRegion([point(0, 0), point(51.5, -0.1)])).toBeNull();
  });
});

describe('gpsHeartRateSeries', () => {
  it('keeps trackpoints with heart rate, in time order', () => {
    const series = gpsHeartRateSeries([
      { ...point(1, 1, '2026-09-20T12:02:00Z'), hr: 150 },
      { ...point(1, 1, '2026-09-20T12:00:00Z'), hr: 120 },
      point(1, 1, '2026-09-20T12:01:00Z'),
    ]);
    expect(series.map((p) => [p.bpm, p.elapsedMinutes])).toEqual([
      [120, 0],
      [150, 2],
    ]);
  });
});

describe('heartRateZoneRows', () => {
  it('orders zones and gives each its share of the time', () => {
    const zone = (index: number, seconds: number) =>
      ({
        zone_index: index,
        zone_lower_bpm: 100 + index * 10,
        zone_upper_bpm: null,
        seconds_in_zone: seconds,
      }) as ExerciseEntryHrZones;
    expect(heartRateZoneRows([zone(2, 300), zone(1, 100)])).toEqual([
      {
        zone: 1,
        lowerBpm: 110,
        upperBpm: null,
        seconds: 100,
        share: 0.25,
        method: null,
      },
      {
        zone: 2,
        lowerBpm: 120,
        upperBpm: null,
        seconds: 300,
        share: 0.75,
        method: null,
      },
    ]);
  });

  it('carries the method the zones were stored with, and flags a mixed workout', () => {
    const stored = (
      index: number,
      method: ExerciseEntryHrZones['zone_method']
    ) =>
      ({
        zone_index: index,
        zone_lower_bpm: 100,
        zone_upper_bpm: null,
        seconds_in_zone: 60,
        zone_method: method,
      }) as ExerciseEntryHrZones;
    expect(heartRateZoneRows([stored(1, 'heart_rate_reserve')])[0].method).toBe(
      'heart_rate_reserve'
    );
    expect(
      combinedHeartRateZoneRows([
        [stored(1, 'percent_max')],
        [stored(1, 'custom')],
      ])[0].method
    ).toBe('mixed');
    expect(
      combinedHeartRateZoneRows([
        [stored(1, 'percent_max')],
        [stored(1, 'percent_max')],
      ])[0].method
    ).toBe('percent_max');
  });
});

describe('combinedHeartRateZoneRows', () => {
  const zone = (
    index: number,
    seconds: number,
    lower: number | null,
    upper: number | null = null
  ) =>
    ({
      zone_index: index,
      zone_lower_bpm: lower,
      zone_upper_bpm: upper,
      seconds_in_zone: seconds,
    }) as ExerciseEntryHrZones;

  it('adds each zone up across entries and shares the total between them', () => {
    expect(
      combinedHeartRateZoneRows([
        [zone(2, 300, 120, 140), zone(1, 100, 100, 120)],
        [zone(2, 500, null, null), zone(3, 100, 140, 160)],
      ])
    ).toEqual([
      {
        zone: 1,
        lowerBpm: 100,
        upperBpm: 120,
        seconds: 100,
        share: 0.1,
        method: null,
      },
      {
        zone: 2,
        lowerBpm: 120,
        upperBpm: 140,
        seconds: 800,
        share: 0.8,
        method: null,
      },
      {
        zone: 3,
        lowerBpm: 140,
        upperBpm: 160,
        seconds: 100,
        share: 0.1,
        method: null,
      },
    ]);
  });

  it('ignores negative seconds and is empty for no entries', () => {
    expect(combinedHeartRateZoneRows([[zone(1, -50, 100)]])).toEqual([
      {
        zone: 1,
        lowerBpm: 100,
        upperBpm: null,
        seconds: 0,
        share: 0,
        method: null,
      },
    ]);
    expect(combinedHeartRateZoneRows([])).toEqual([]);
  });
});

describe('cardioSessionFromDiaryEntry', () => {
  const entry = (
    overrides: Partial<IndividualSessionResponse> = {}
  ): IndividualSessionResponse =>
    ({
      type: 'individual',
      id: 'e1',
      name: 'Stair Climbing',
      entry_date: '2026-10-01',
      entry_time: '07:30:00',
      duration_minutes: 20,
      calories_burned: 150,
      avg_heart_rate: 128,
      distance: 2,
      source: 'apple_health',
      notes: null,
      category: null,
      sets: [],
      exercise_snapshot: null,
      ...overrides,
    }) as IndividualSessionResponse;

  it('maps a synced workout, converting distance to the display unit', () => {
    const item = cardioSessionFromDiaryEntry(entry(), 'miles');
    expect(item).toMatchObject({
      id: 'e1',
      exerciseName: 'Stair Climbing',
      entryDate: '2026-10-01',
      durationMinutes: 20,
      avgHeartRate: 128,
      distanceMeters: 2000,
    });
    expect(item!.distanceFormatted).toBeCloseTo(1.243, 2);
  });

  it('carries floors climbed and elevation gain so a stair workout shows them from the diary', () => {
    const item = cardioSessionFromDiaryEntry(
      entry({ floors_climbed: 56, elevation_gain_meters: 181.9 }),
      'km'
    );
    expect(item).toMatchObject({
      floorsClimbed: 56,
      elevationGainMeters: 181.9,
    });
  });

  it('carries the weather, reading a temperature that arrives as text', () => {
    const item = cardioSessionFromDiaryEntry(
      entry({
        weather_temp_celsius: '0.0' as unknown as number,
        weather_condition: 'Light rain',
      }),
      'km'
    );
    expect(item).toMatchObject({
      weatherTempCelsius: 0,
      weatherCondition: 'Light rain',
    });
  });

  it('leaves the weather temperature null when none was recorded', () => {
    for (const missing of [null, undefined, '']) {
      const item = cardioSessionFromDiaryEntry(
        entry({ weather_temp_celsius: missing as unknown as number }),
        'km'
      );
      expect(item?.weatherTempCelsius).toBeNull();
    }
  });

  it('reads floors and elevation that arrive as numeric strings', () => {
    // The diary entry is a raw database row; numeric columns come back as text.
    const item = cardioSessionFromDiaryEntry(
      entry({
        floors_climbed: '56' as unknown as number,
        elevation_gain_meters: '181.9056' as unknown as number,
      }),
      'km'
    );
    expect(item?.floorsClimbed).toBe(56);
    expect(item?.elevationGainMeters).toBeCloseTo(181.9056, 4);
  });

  it('leaves floors and elevation null when none were measured', () => {
    for (const overrides of [
      {},
      { floors_climbed: null, elevation_gain_meters: null },
      { floors_climbed: 0, elevation_gain_meters: 0 },
      { floors_climbed: 'n/a' as unknown as number },
    ]) {
      const item = cardioSessionFromDiaryEntry(entry(overrides), 'km');
      expect(item?.floorsClimbed).toBeNull();
      expect(item?.elevationGainMeters).toBeNull();
    }
  });

  it('leaves in-app entries on the basic screen', () => {
    for (const source of [
      'manual',
      'Manual',
      'sparky',
      'workout plan',
      null,
      undefined,
    ]) {
      expect(cardioSessionFromDiaryEntry(entry({ source }), 'km')).toBeNull();
    }
  });

  it('maps an in-app entry when the caller has found a route for it', () => {
    const item = cardioSessionFromDiaryEntry(
      entry({ source: 'Manual', name: 'Walking' }),
      'km',
      { allowInApp: true }
    );
    expect(item).toMatchObject({ id: 'e1', exerciseName: 'Walking' });
  });

  it('still refuses a strength session, even when in-app entries are allowed', () => {
    expect(
      cardioSessionFromDiaryEntry(
        entry({
          source: 'Manual',
          sets: [{ weight: 50, reps: 5 }] as IndividualSessionResponse['sets'],
        }),
        'km',
        { allowInApp: true }
      )
    ).toBeNull();
  });

  it('titles a nameless synced workout', () => {
    const item = cardioSessionFromDiaryEntry(
      entry({ name: null, category: null, exercise_snapshot: null }),
      'km'
    );
    expect(item?.exerciseName).toBe('Workout');
  });

  it('leaves strength sessions on the basic screen', () => {
    const sets = [{ weight: 50, reps: 8 }] as IndividualSessionResponse['sets'];
    expect(cardioSessionFromDiaryEntry(entry({ sets }), 'km')).toBeNull();
  });

  it('leaves a weight_reps snapshot with no sets on the basic screen', () => {
    const exercise_snapshot = {
      modality: 'weight_reps',
    } as IndividualSessionResponse['exercise_snapshot'];
    expect(
      cardioSessionFromDiaryEntry(entry({ sets: [], exercise_snapshot }), 'km')
    ).toBeNull();
  });

  it('carries the modality so a duration-only workout hides its route', () => {
    const exercise_snapshot = {
      modality: 'duration',
    } as IndividualSessionResponse['exercise_snapshot'];
    const item = cardioSessionFromDiaryEntry(
      entry({ sets: [], exercise_snapshot }),
      'km'
    );
    expect(item!.modality).toBe('duration');
  });
});

describe('paceSeriesFromTrack', () => {
  const T0 = Date.UTC(2026, 8, 26, 7, 0, 0);
  const at = (seconds: number, metersNorth: number, extra = {}) =>
    ({
      t: new Date(T0 + seconds * 1000).toISOString(),
      lat: 51.5 + metersNorth / 111_194.9,
      lon: -0.1,
      ...extra,
    }) as GpsTrackPoint;
  const KM = 1000;

  it('reads a steady pace along the distance', () => {
    // 4 m/s is 250 s per km.
    const track = Array.from({ length: 13 }, (_, i) => at(i * 10, i * 40));
    const series = paceSeriesFromTrack(track, KM);
    expect(series.length).toBeGreaterThan(0);
    for (const p of series) expect(p.paceSeconds).toBeCloseTo(250, 0);
    expect(series[series.length - 1].distance).toBeCloseTo(0.48, 2);
  });

  it('uses the points own distance when the track has it', () => {
    const track = [at(0, 0, { dist: 0 }), at(60, 0, { dist: 300 })];
    const [first] = paceSeriesFromTrack(track, KM);
    // 300 m in 60 s, whatever the coordinates say.
    expect(first.paceSeconds).toBeCloseTo(200, 5);
    expect(first.distance).toBeCloseTo(0.3, 5);
  });

  it('leaves out stretches where the person was standing still', () => {
    const track = [
      at(0, 0),
      at(30, 120),
      // Stopped for two minutes.
      at(60, 120),
      at(90, 120),
      at(120, 120),
      at(150, 120),
      at(180, 240),
    ];
    const series = paceSeriesFromTrack(track, KM);
    expect(series.every((p) => p.paceSeconds < 600)).toBe(true);
  });

  it('measures in miles when asked', () => {
    const track = [at(0, 0, { dist: 0 }), at(60, 0, { dist: 160.9344 })];
    const [first] = paceSeriesFromTrack(track, 1609.344);
    // 0.1 mile in a minute is ten minutes a mile.
    expect(first.paceSeconds).toBeCloseTo(600, 3);
  });

  it('gives nothing for too few or unusable points', () => {
    expect(paceSeriesFromTrack([at(0, 0)], KM)).toEqual([]);
    expect(paceSeriesFromTrack([at(0, 0), at(5, 10)], KM)).toEqual([]);
  });

  it('ignores an out-of-order point instead of adding its distance', () => {
    const track = [
      at(0, 0),
      at(40, 100),
      // Earlier, and a long way off. It must not move the distance along.
      at(10, 5000),
      at(80, 200),
    ];
    const series = paceSeriesFromTrack(track, KM);

    expect(series.length).toBeGreaterThan(0);
    expect(series[series.length - 1].distance).toBeLessThan(0.3);
  });

  it('thins a very long track', () => {
    const track = Array.from({ length: 5000 }, (_, i) => at(i * 31, i * 100));
    expect(paceSeriesFromTrack(track, KM).length).toBeLessThanOrEqual(402);
  });

  it('keeps the fastest reading when a long track is thinned', () => {
    const track = Array.from({ length: 800 }, (_, i) =>
      at(i * 31, i === 2 ? 800 : i * 80)
    );
    const series = paceSeriesFromTrack(track, KM);
    const best = Math.min(...series.map((point) => point.paceSeconds));

    expect(best).toBeLessThan(100);
  });
});

describe('paceSeriesFromDistance', () => {
  test('turns distance against active time into pace per unit', () => {
    // 3 m/s = 5:33 per km.
    const rows = [0, 10, 20, 30, 40, 50, 60].map((s) => [s, s * 3]);
    const series = paceSeriesFromDistance(rows, 1000);
    expect(series.length).toBeGreaterThan(0);
    expect(series[0].paceSeconds).toBeCloseTo(1000 / 3, 0);
    expect(series[series.length - 1].distance).toBeCloseTo(0.18, 2);
  });

  test('needs two readings and leaves out standing still', () => {
    expect(paceSeriesFromDistance([[0, 0]], 1000)).toEqual([]);
    expect(
      paceSeriesFromDistance(
        [
          [0, 100],
          [60, 100],
        ],
        1000
      )
    ).toEqual([]);
  });
});

describe('splitsFromTrack', () => {
  const track = (count: number, metersPerStep = 20, alt = false) =>
    Array.from({ length: count }, (_, i) => ({
      t: new Date(Date.UTC(2026, 9, 6, 10, 0, i * 5)).toISOString(),
      lat: 51.5 + (i * metersPerStep) / 111_195,
      lon: -0.12,
      ...(alt ? { alt: 100 + i } : {}),
    }));

  it('cuts a stored track into kilometres with pace, climb and heart rate', () => {
    const points = track(120, 20, true);
    const t0 = Date.UTC(2026, 9, 6, 10, 0, 0);
    const splits = splitsFromTrack(points, 1000, [
      { timestamp: t0 + 60_000, bpm: 150 },
    ]);
    expect(splits.length).toBeGreaterThanOrEqual(2);
    expect(splits[0].partial).toBe(false);
    expect(splits[0].durationSeconds).toBeCloseTo(250, 0);
    expect(splits[0].elevationChangeMeters).toBeGreaterThan(0);
    expect(splits[0].avgHeartRate).toBe(150);
    expect(splits[1].avgHeartRate).toBeNull();
  });

  it('returns nothing for a track too short to split', () => {
    expect(splitsFromTrack(track(1), 1000)).toEqual([]);
  });

  it('skips repeated and out-of-order timestamps', () => {
    const points = track(60, 20);
    const shuffled = [points[0], points[0], ...points.slice(1)];
    expect(splitsFromTrack(shuffled, 1000)).toEqual(
      splitsFromTrack(points, 1000)
    );
  });
});
