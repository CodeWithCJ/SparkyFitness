import type { AggregatedSleepSession } from '../../types/healthRecords';

/** A plausible body or skin temperature in °C; anything else is a bad reading. */
const MIN_CELSIUS = 20;
const MAX_CELSIUS = 45;

export interface BodyTemperatureReading {
  /** Reading time, epoch ms. */
  ms: number;
  celsius: number;
}

export interface OvernightBodyTemperature {
  /** Mean of the readings taken inside the night's sleep, in °C. */
  value: number;
  /** The device-local wake day the night belongs to. */
  date: string;
  /** When the night ended, so the server dates and orders the reading. */
  timestamp: string;
  record_timezone?: string;
}

/**
 * One reading per wake day: the mean of the body temperature readings that fall
 * inside that day's longest sleep, for a ring or watch that writes Body
 * Temperature through the night.
 *
 * Body Temperature is stored as one value per day, so a night cannot be
 * recovered from the stored value; this works from the raw readings. A night
 * with no reading inside its sleep gets no record, so a daytime check never
 * stands in for it.
 */
export const overnightBodyTemperatures = (
  sessions: AggregatedSleepSession[],
  readings: BodyTemperatureReading[]
): OvernightBodyTemperature[] => {
  const valid = readings.filter(
    (r) =>
      Number.isFinite(r.ms) &&
      Number.isFinite(r.celsius) &&
      r.celsius >= MIN_CELSIUS &&
      r.celsius <= MAX_CELSIUS
  );
  if (valid.length === 0) return [];

  // Longest sleep per wake day, so a nap never replaces the night.
  const primaryByDay = new Map<string, AggregatedSleepSession>();
  for (const session of sessions) {
    if (!session.entry_date) continue;
    const asleep =
      session.time_asleep_in_seconds > 0
        ? session.time_asleep_in_seconds
        : session.duration_in_seconds;
    const current = primaryByDay.get(session.entry_date);
    const currentAsleep = current
      ? current.time_asleep_in_seconds > 0
        ? current.time_asleep_in_seconds
        : current.duration_in_seconds
      : -1;
    if (asleep > currentAsleep) primaryByDay.set(session.entry_date, session);
  }

  const nights: OvernightBodyTemperature[] = [];
  for (const [date, session] of primaryByDay) {
    const startMs = Date.parse(session.bedtime);
    const endMs = Date.parse(session.wake_time);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const inNight = valid.filter((r) => r.ms >= startMs && r.ms <= endMs);
    if (inNight.length === 0) continue;
    const mean =
      inNight.reduce((sum, r) => sum + r.celsius, 0) / inNight.length;
    nights.push({
      value: Math.round(mean * 100) / 100,
      date,
      timestamp: session.wake_time,
      ...(session.record_timezone
        ? { record_timezone: session.record_timezone }
        : {}),
    });
  }
  return nights.sort((a, b) => a.date.localeCompare(b.date));
};
