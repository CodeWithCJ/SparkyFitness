/**
 * Generates the committed synthetic FIT fixture `tennis-activity.fit`.
 *
 * Run with: pnpm exec tsx tests/fixtures/generateFitFixture.ts
 *
 * The fixture is a fake tennis activity with hand-picked values (fake serial
 * number and timestamps, per-second HR records, GPS points, one lap, HR
 * zones) so `tests/fitActivityTransform.test.ts` can assert exact outputs.
 * Real exported activities stay local-only (they carry personal biometrics).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Encoder, Profile, Utils } from '@garmin/fitsdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Start at 02:00 UTC with a -3h device offset so the device-local day
// (2026-01-14) differs from the UTC day (2026-01-15) — pins the offset math.
const START = new Date('2026-01-15T02:00:00Z');
const LOCAL_OFFSET_MS = -3 * 60 * 60 * 1000;
const DURATION_SECONDS = 3600.5;
const END = new Date(START.getTime() + 3700 * 1000);
const SERIAL_NUMBER = 1234567890;

const toFit = (date: Date) => Utils.convertDateToDateTime(date);
const DEGREES_TO_SEMICIRCLES = 2 ** 31 / 180;

const encoder = new Encoder();

encoder.writeMesg({
  mesgNum: Profile.MesgNum.FILE_ID,
  type: 'activity',
  manufacturer: 'garmin',
  product: 4432,
  serialNumber: SERIAL_NUMBER,
  timeCreated: toFit(START),
});

encoder.writeMesg({
  mesgNum: Profile.MesgNum.SPORT,
  sport: 'tennis',
  subSport: 'generic',
  name: 'Synthetic Tennis',
});

interface FixtureRecord {
  offsetSeconds: number;
  heartRate?: number;
  distance: number;
  enhancedSpeed: number;
  enhancedAltitude: number;
  cadence: number;
  fractionalCadence?: number;
  latDegrees?: number;
  lonDegrees?: number;
}

// Record 4 omits heartRate to pin the null-slot behaviour; the first two
// records carry GPS to pin the semicircle conversion.
const records: FixtureRecord[] = [
  {
    offsetSeconds: 0,
    heartRate: 80,
    distance: 0,
    enhancedSpeed: 0,
    enhancedAltitude: 10,
    cadence: 12,
    fractionalCadence: 0.5,
    latDegrees: 45,
    lonDegrees: -90,
  },
  {
    offsetSeconds: 1,
    heartRate: 90,
    distance: 10,
    enhancedSpeed: 1.5,
    enhancedAltitude: 11,
    cadence: 12,
    latDegrees: 45,
    lonDegrees: -90,
  },
  {
    offsetSeconds: 2,
    heartRate: 100,
    distance: 20,
    enhancedSpeed: 2.5,
    enhancedAltitude: 12,
    cadence: 12,
  },
  {
    offsetSeconds: 3,
    distance: 30,
    enhancedSpeed: 3.5,
    enhancedAltitude: 13,
    cadence: 12,
  },
  {
    offsetSeconds: 4,
    heartRate: 120,
    distance: 40,
    enhancedSpeed: 4.5,
    enhancedAltitude: 14,
    cadence: 12,
  },
];

for (const record of records) {
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.RECORD,
    timestamp: toFit(new Date(START.getTime() + record.offsetSeconds * 1000)),
    ...(record.heartRate !== undefined ? { heartRate: record.heartRate } : {}),
    distance: record.distance,
    enhancedSpeed: record.enhancedSpeed,
    enhancedAltitude: record.enhancedAltitude,
    cadence: record.cadence,
    ...(record.fractionalCadence !== undefined
      ? { fractionalCadence: record.fractionalCadence }
      : {}),
    ...(record.latDegrees !== undefined && record.lonDegrees !== undefined
      ? {
          positionLat: Math.round(record.latDegrees * DEGREES_TO_SEMICIRCLES),
          positionLong: Math.round(record.lonDegrees * DEGREES_TO_SEMICIRCLES),
        }
      : {}),
  });
}

encoder.writeMesg({
  mesgNum: Profile.MesgNum.LAP,
  timestamp: toFit(END),
  startTime: toFit(START),
  totalTimerTime: DURATION_SECONDS,
  totalElapsedTime: 3700,
  totalDistance: 1200.5,
  totalCalories: 850,
  avgHeartRate: 120,
  maxHeartRate: 175,
  avgCadence: 12,
  maxCadence: 40,
  enhancedAvgSpeed: 0.33,
  enhancedMaxSpeed: 5.5,
  messageIndex: 0,
  event: 'lap',
  eventType: 'stop',
});

encoder.writeMesg({
  mesgNum: Profile.MesgNum.SESSION,
  timestamp: toFit(END),
  startTime: toFit(START),
  totalTimerTime: DURATION_SECONDS,
  totalElapsedTime: 3700,
  totalDistance: 1200.5,
  totalCalories: 850,
  avgHeartRate: 120,
  maxHeartRate: 175,
  avgCadence: 12,
  maxCadence: 40,
  enhancedAvgSpeed: 0.33,
  enhancedMaxSpeed: 5.5,
  sport: 'tennis',
  subSport: 'generic',
  sportProfileName: 'Synthetic Tennis Profile',
  messageIndex: 0,
  firstLapIndex: 0,
  numLaps: 1,
  event: 'session',
  eventType: 'stop',
});

// The lap-referenced zones come first so tests prove the transform picks the
// session-referenced message rather than the first one.
encoder.writeMesg({
  mesgNum: Profile.MesgNum.TIME_IN_ZONE,
  timestamp: toFit(END),
  referenceMesg: 'lap',
  referenceIndex: 0,
  timeInHrZone: [1, 2, 3, 4, 5, 6, 7],
  hrZoneHighBoundary: [90, 110, 130, 150, 170, 190],
});
encoder.writeMesg({
  mesgNum: Profile.MesgNum.TIME_IN_ZONE,
  timestamp: toFit(END),
  referenceMesg: 'session',
  referenceIndex: 0,
  timeInHrZone: [100, 200, 300, 400, 500, 60, 0],
  hrZoneHighBoundary: [90, 110, 130, 150, 170, 190],
});

encoder.writeMesg({
  mesgNum: Profile.MesgNum.ACTIVITY,
  timestamp: toFit(END),
  localTimestamp: toFit(new Date(END.getTime() + LOCAL_OFFSET_MS)),
  totalTimerTime: DURATION_SECONDS,
  numSessions: 1,
  type: 'manual',
  event: 'activity',
  eventType: 'stop',
});

const bytes = encoder.close();
const outPath = join(__dirname, 'tennis-activity.fit');
writeFileSync(outPath, bytes);
// eslint-disable-next-line no-console
console.log(`Wrote ${bytes.length} bytes to ${outPath}`);
