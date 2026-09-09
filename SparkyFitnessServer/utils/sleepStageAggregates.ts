// Sleep stage clustering + aggregate helpers.
//
// Health Connect / HealthKit sync merges stages onto one entry_date. When a
// disconnected block (next-night evening fragment or daytime nap) lands on the
// same row, min(start)→max(end) produces a ~24h History envelope (#1954).
// Cluster by gap (same 4h threshold as the HealthKit mobile aggregator) and
// take the primary (longest asleep) cluster for bedtime/wake/duration.

export const SLEEP_STAGE_CLUSTER_GAP_MS = 4 * 60 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sumAsleepSeconds(stages: any[]): number {
  if (!Array.isArray(stages)) return 0;
  return stages.reduce((sum, stage) => {
    if (
      stage.stage_type === 'deep' ||
      stage.stage_type === 'light' ||
      stage.stage_type === 'rem'
    ) {
      return sum + (Math.round(Number(stage.duration_in_seconds)) || 0);
    }
    return sum;
  }, 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function clusterSleepStagesByGap(
  stages: any[],
  gapMs = SLEEP_STAGE_CLUSTER_GAP_MS
) {
  if (!Array.isArray(stages) || stages.length === 0) return [];
  const sorted = [...stages].sort(
    (a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clusters: any[][] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any[] = [sorted[0]];
  let clusterEnd = new Date(sorted[0].end_time).getTime();
  for (let i = 1; i < sorted.length; i++) {
    const stage = sorted[i];
    const startMs = new Date(stage.start_time).getTime();
    const endMs = new Date(stage.end_time).getTime();
    if (startMs - clusterEnd > gapMs) {
      clusters.push(current);
      current = [stage];
      clusterEnd = endMs;
    } else {
      current.push(stage);
      if (endMs > clusterEnd) clusterEnd = endMs;
    }
  }
  clusters.push(current);
  return clusters;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sleepStageEnvelopeSeconds(stages: any[]) {
  if (!stages || stages.length === 0) return 0;
  let minStart = new Date(stages[0].start_time).getTime();
  let maxEnd = new Date(stages[0].end_time).getTime();
  for (const s of stages) {
    const startMs = new Date(s.start_time).getTime();
    const endMs = new Date(s.end_time).getTime();
    if (startMs < minStart) minStart = startMs;
    if (endMs > maxEnd) maxEnd = endMs;
  }
  return Math.max(0, Math.round((maxEnd - minStart) / 1000));
}

// Prefer the longest asleep block; tie-break on envelope duration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPrimarySleepStageCluster(stages: any[]) {
  const clusters = clusterSleepStagesByGap(stages);
  if (clusters.length === 0) return [];
  if (clusters.length === 1) return clusters[0];
  let best = clusters[0];
  let bestAsleep = sumAsleepSeconds(best);
  let bestEnvelope = sleepStageEnvelopeSeconds(best);
  for (let i = 1; i < clusters.length; i++) {
    const candidate = clusters[i];
    const asleep = sumAsleepSeconds(candidate);
    const envelope = sleepStageEnvelopeSeconds(candidate);
    if (
      asleep > bestAsleep ||
      (asleep === bestAsleep && envelope > bestEnvelope)
    ) {
      best = candidate;
      bestAsleep = asleep;
      bestEnvelope = envelope;
    }
  }
  return best;
}

// Aggregates from the primary cluster only. Within one night, partial re-sync
// gaps stay under the 4h threshold so #1180 union behavior is preserved.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function recomputeSleepAggregatesFromStages(stages: any[]) {
  const primary = getPrimarySleepStageCluster(stages);
  if (!primary || primary.length === 0) {
    return {
      bedtime: null,
      wake_time: null,
      duration_in_seconds: 0,
      time_asleep_in_seconds: 0,
      deep_sleep_seconds: 0,
      light_sleep_seconds: 0,
      rem_sleep_seconds: 0,
      awake_sleep_seconds: 0,
    };
  }
  let minStart = new Date(primary[0].start_time).getTime();
  let maxEnd = new Date(primary[0].end_time).getTime();
  let deep = 0;
  let light = 0;
  let rem = 0;
  let awake = 0;
  for (const s of primary) {
    const startMs = new Date(s.start_time).getTime();
    const endMs = new Date(s.end_time).getTime();
    if (startMs < minStart) minStart = startMs;
    if (endMs > maxEnd) maxEnd = endMs;
    const duration = Math.round(Number(s.duration_in_seconds)) || 0;
    switch (s.stage_type) {
      case 'deep':
        deep += duration;
        break;
      case 'light':
        light += duration;
        break;
      case 'rem':
        rem += duration;
        break;
      case 'awake':
        awake += duration;
        break;
      default:
        break;
    }
  }
  const durationInSeconds = Math.max(0, Math.round((maxEnd - minStart) / 1000));
  const timeAsleep = sumAsleepSeconds(primary);
  return {
    bedtime: new Date(minStart),
    wake_time: new Date(maxEnd),
    duration_in_seconds: durationInSeconds,
    time_asleep_in_seconds: timeAsleep,
    deep_sleep_seconds: deep,
    light_sleep_seconds: light,
    rem_sleep_seconds: rem,
    awake_sleep_seconds: awake,
  };
}
