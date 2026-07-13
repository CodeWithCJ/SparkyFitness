import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { FitMessages } from '@garmin/fitsdk';
import { decodeFitBuffer } from '../integrations/garminfit/fitDecoder.js';
import { transformFitActivity } from '../integrations/garminfit/fitActivityTransform.js';

const FIXTURE_PATH = new URL('./fixtures/tennis-activity.fit', import.meta.url);
const START_MS = Date.parse('2026-01-15T02:00:00Z');

function decodeFixture() {
  const buffer = readFileSync(FIXTURE_PATH);
  const decoded = decodeFitBuffer(buffer);
  if (!decoded.messages) throw new Error('Fixture failed to decode');
  return { buffer, messages: decoded.messages, decoded };
}

function transformFixture() {
  const { buffer, messages } = decodeFixture();
  const result = transformFitActivity(messages, buffer);
  if (!result.ok) throw new Error(`Fixture transform failed: ${result.reason}`);
  return result;
}

/** Minimal valid message set for unit tests that craft their own inputs. */
function baseMessages(overrides: Partial<FitMessages> = {}): FitMessages {
  return {
    fileIdMesgs: [
      { serialNumber: 42, timeCreated: new Date('2026-03-01T10:00:00Z') },
    ],
    sessionMesgs: [
      {
        startTime: new Date('2026-03-01T10:00:00Z'),
        totalTimerTime: 600,
        totalCalories: 100,
        sport: 'tennis',
      },
    ],
    ...overrides,
  } as FitMessages;
}

describe('fitDecoder', () => {
  it('decodes the synthetic fixture with clean integrity', () => {
    const { decoded } = decodeFixture();
    expect(decoded.isFit).toBe(true);
    expect(decoded.integrityOk).toBe(true);
    expect(decoded.errors).toEqual([]);
    expect(decoded.messages?.recordMesgs).toHaveLength(5);
  });

  it('rejects a non-FIT buffer without throwing', () => {
    const decoded = decodeFitBuffer(Buffer.from('definitely not a fit file'));
    expect(decoded.isFit).toBe(false);
    expect(decoded.messages).toBeNull();
  });
});

describe('transformFitActivity — fixture end-to-end', () => {
  it('produces the exercise entry row data', () => {
    const result = transformFixture();
    expect(result.kind).toBe('simple');
    expect(result.entryData.duration_minutes).toBeCloseTo(3600.5 / 60, 6);
    expect(result.entryData.calories_burned).toBe(850);
    expect(result.entryData.distance).toBeCloseTo(1.2005, 6);
    expect(result.entryData.avg_heart_rate).toBe(120);
    expect(result.entryData.steps).toBeNull();
    expect(result.entryData.notes).toBe(
      'Garmin FIT Import: Synthetic Tennis (tennis)'
    );
  });

  it('builds source_id from serial number and creation epoch', () => {
    const result = transformFixture();
    expect(result.sourceId).toBe(`1234567890_${START_MS / 1000}`);
  });

  it('derives the device-local entry date from the activity message offset', () => {
    const result = transformFixture();
    // 02:00 UTC with a -3h device offset is still the previous local day.
    expect(result.entryDate).toBe('2026-01-14');
    expect(result.warnings).toEqual([]);
  });

  it('builds the activity summary with Garmin Connect units and no foreign markers', () => {
    const { activity } = transformFixture().detailData;
    expect(activity.activityName).toBe('Synthetic Tennis');
    expect(activity.activityType).toEqual({ typeKey: 'tennis' });
    expect(activity.duration).toBeCloseTo(60.00833, 4); // minutes
    expect(activity.distance).toBeCloseTo(1.2005, 6); // km
    expect(activity.calories).toBe(850);
    expect(activity.active_calories).toBe(850);
    expect(activity.averageHR).toBe(120);
    expect(activity.maxHR).toBe(175);
    expect(activity.averageSpeed).toBeCloseTo(0.33, 6); // m/s
    expect(activity.averageRunCadenceInStepsPerMinute).toBe(12); // not doubled for tennis
    expect(activity.startTimeLocal).toBe('2026-01-14T23:00:00');
    // Strava/Fitbit provider-detection markers would mis-scale duration/distance.
    for (const marker of [
      'sport_type',
      'moving_time',
      'elapsed_time',
      'activeDuration',
      'averageHeartRate',
      'logId',
    ]) {
      expect(activity).not.toHaveProperty(marker);
    }
  });

  it('emits one metric row per record with ms-epoch timestamps and null gaps', () => {
    const { details } = transformFixture().detailData;
    expect(details.metricDescriptors).toEqual([
      { key: 'directTimestamp', metricsIndex: 0 },
      { key: 'directHeartRate', metricsIndex: 1 },
      { key: 'sumDistance', metricsIndex: 2 },
      { key: 'directSpeed', metricsIndex: 3 },
      { key: 'directElevation', metricsIndex: 4 },
      { key: 'directDoubleCadence', metricsIndex: 5 },
    ]);
    expect(details.activityDetailMetrics).toHaveLength(5);
    // fractionalCadence 0.5 is added to cadence 12.
    expect(details.activityDetailMetrics[0].metrics).toEqual([
      START_MS,
      80,
      0,
      0,
      10,
      12.5,
    ]);
    // Record 4 has no heart rate — the slot must be null, not dropped.
    expect(details.activityDetailMetrics[3].metrics).toEqual([
      START_MS + 3000,
      null,
      30,
      3.5,
      13,
      12,
    ]);
    // Frontend treats values >= 1e12 as absolute ms epochs.
    expect(START_MS).toBeGreaterThanOrEqual(1e12);
  });

  it('converts GPS semicircles to a degree polyline', () => {
    const { details } = transformFixture().detailData;
    expect(details.geoPolylineDTO?.polyline).toHaveLength(2);
    expect(details.geoPolylineDTO?.polyline[0].lat).toBeCloseTo(45, 6);
    expect(details.geoPolylineDTO?.polyline[0].lon).toBeCloseTo(-90, 6);
  });

  it('maps laps to Garmin Connect lapDTOs', () => {
    const { splits } = transformFixture().detailData;
    expect(splits.lapDTOs).toEqual([
      {
        lapIndex: 1,
        distance: 1200.5,
        duration: 3600.5,
        movingDuration: 3600.5,
        elapsedDuration: 3700,
        averageSpeed: 0.33,
        averageMovingSpeed: 0.33,
        maxSpeed: 5.5,
        averageHR: 120,
        maxHR: 175,
        averageRunCadence: 12,
        maxRunCadence: 40,
        calories: 850,
      },
    ]);
  });

  it('maps the session-referenced HR zones, not the first time-in-zone message', () => {
    const { hr_in_timezones } = transformFixture().detailData;
    expect(hr_in_timezones).toHaveLength(7);
    expect(hr_in_timezones[0]).toEqual({
      zoneNumber: 0,
      zoneLowBoundary: 0,
      secsInZone: 100,
    });
    expect(hr_in_timezones[1]).toEqual({
      zoneNumber: 1,
      zoneLowBoundary: 90,
      secsInZone: 200,
    });
    expect(hr_in_timezones[6]).toEqual({
      zoneNumber: 6,
      zoneLowBoundary: 190,
      secsInZone: 0,
    });
  });
});

describe('transformFitActivity — unit behaviour', () => {
  it('doubles cadence and derives steps for running', () => {
    const messages = baseMessages({
      sessionMesgs: [
        {
          startTime: new Date('2026-03-01T10:00:00Z'),
          totalTimerTime: 1800,
          totalCalories: 300,
          sport: 'running',
          avgCadence: 80,
          totalStrides: 2500,
        },
      ],
      recordMesgs: [
        { timestamp: new Date('2026-03-01T10:00:00Z'), cadence: 80 },
      ],
    } as Partial<FitMessages>);
    const result = transformFitActivity(messages, Buffer.from('x'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.detailData.activity.averageRunCadenceInStepsPerMinute).toBe(
      160
    );
    expect(result.entryData.steps).toBe(5000);
    expect(result.detailData.details.activityDetailMetrics[0].metrics).toEqual([
      Date.parse('2026-03-01T10:00:00Z'),
      160,
    ]);
  });

  it('normalizes camelCase sports to snake_case type keys', () => {
    const messages = baseMessages({
      sessionMesgs: [
        {
          startTime: new Date('2026-03-01T10:00:00Z'),
          totalTimerTime: 60,
          sport: 'trailRunning',
        },
      ],
    } as Partial<FitMessages>);
    const result = transformFitActivity(messages, Buffer.from('x'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.sport).toBe('trail_running');
    expect(result.activityName).toBe('Trail Running');
  });

  it('handles localTimestamp arriving as a shifted Date', () => {
    const messages = baseMessages({
      activityMesgs: [
        {
          timestamp: new Date('2026-03-01T10:00:00Z'),
          // Some SDK paths convert localDateTime to a shifted Date (+2h here).
          localTimestamp: new Date('2026-03-01T12:00:00Z'),
        },
      ],
      sessionMesgs: [
        {
          startTime: new Date('2026-03-01T23:00:00Z'),
          totalTimerTime: 60,
          sport: 'tennis',
        },
      ],
    } as Partial<FitMessages>);
    const result = transformFitActivity(messages, Buffer.from('x'));
    if (!result.ok) throw new Error(result.reason);
    // 23:00 UTC + 2h offset rolls into the next local day.
    expect(result.entryDate).toBe('2026-03-02');
  });

  it('returns a null entry date and a warning when local time is missing', () => {
    const result = transformFitActivity(baseMessages(), Buffer.from('x'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.entryDate).toBeNull();
    expect(result.warnings).toHaveLength(1);
  });

  it('falls back to a buffer hash source_id without file id data', () => {
    const buffer = Buffer.from('some fit file bytes');
    const result = transformFitActivity(
      baseMessages({ fileIdMesgs: [] } as Partial<FitMessages>),
      buffer
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.sourceId).toBe(
      createHash('sha256').update(buffer).digest('hex')
    );
  });

  it('classifies strength files without changing the v1 summary shape', () => {
    const messages = baseMessages({
      sessionMesgs: [
        {
          startTime: new Date('2026-03-01T10:00:00Z'),
          totalTimerTime: 1800,
          sport: 'training',
          subSport: 'strengthTraining',
        },
      ],
    } as Partial<FitMessages>);
    const result = transformFitActivity(messages, Buffer.from('x'));
    if (!result.ok) throw new Error(result.reason);
    expect(result.kind).toBe('strength');
    expect(result.sport).toBe('training');
  });

  it('rejects multi-session files', () => {
    const session = {
      startTime: new Date('2026-03-01T10:00:00Z'),
      totalTimerTime: 60,
      sport: 'tennis',
    };
    const result = transformFitActivity(
      baseMessages({
        sessionMesgs: [session, session],
      } as Partial<FitMessages>),
      Buffer.from('x')
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.reason).toMatch(/multi-session/i);
  });

  it('rejects files without a session', () => {
    const result = transformFitActivity(
      baseMessages({ sessionMesgs: [] } as Partial<FitMessages>),
      Buffer.from('x')
    );
    expect(result.ok).toBe(false);
  });

  it('rejects files above the record cap', () => {
    const record = { timestamp: new Date('2026-03-01T10:00:00Z') };
    const result = transformFitActivity(
      baseMessages({
        recordMesgs: new Array(100_001).fill(record),
      } as Partial<FitMessages>),
      Buffer.from('x')
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.reason).toMatch(/100000/);
  });

  it('rejects files whose decoded detail data exceeds the size cap', () => {
    const messages = baseMessages({
      sportMesgs: [{ name: 'x'.repeat(11 * 1024 * 1024) }],
    } as Partial<FitMessages>);
    const result = transformFitActivity(messages, Buffer.from('x'));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.reason).toMatch(/limit 10MB/);
  });
});
