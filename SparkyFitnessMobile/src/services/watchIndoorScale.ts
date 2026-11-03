import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';
import { learnScale, type LearnedScale } from '../utils/indoorDistanceScale';

/**
 * The learned factor for the watch's indoor distance (see
 * `utils/indoorDistanceScale.ts`), kept on this phone and sent to the watch in
 * its context as `indoorDistanceScale`.
 */
const STORAGE_KEY = '@SparkyFitness/watchIndoorScale';

type Kind = 'walk' | 'run';
/** Where the correction was entered: on the wrist, or on the phone's run summary. */
export type LearnSource = 'watch' | 'phone';
/** The factor, and the state before the run taught last, so that run can be replaced. */
type StoredScale = LearnedScale & {
  last?: { runId: string; before: LearnedScale | null };
};
type Stored = Partial<Record<Kind, StoredScale>>;

const listeners = new Set<() => void>();

async function read(): Promise<Stored> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Stored) : {};
  } catch {
    return {};
  }
}

/** The factors to send to the watch; 1 for a kind with nothing learned. */
export async function getWatchIndoorScale(): Promise<{
  walk: number;
  run: number;
}> {
  const stored = await read();
  return { walk: stored.walk?.scale ?? 1, run: stored.run?.scale ?? 1 };
}

/** Called when a learned factor changes, so the watch context is resent. */
export function onWatchIndoorScaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Learns from a treadmill distance entered for a watch indoor session.
 * Best effort: a storage failure is logged and never fails the caller.
 *
 * `runId` names the run, so a run is counted once however often it is taught:
 * a distance typed on the wrist and then edited on the phone, or a filing that
 * is retried, replaces the run's earlier sample instead of adding another.
 * Only the run taught last can be replaced; an earlier one stays counted.
 */
export async function learnWatchIndoorScale(
  kind: string,
  applied: number,
  shownMeters: number,
  enteredMeters: number,
  source: LearnSource = 'watch',
  runId?: string
): Promise<void> {
  if (kind !== 'walk' && kind !== 'run') return;
  try {
    const stored = await read();
    const current = stored[kind] ?? null;
    const replacing =
      runId != null && current?.last != null && current.last.runId === runId;
    // What the factor was before this run first taught it.
    const base: LearnedScale | null = replacing
      ? (current?.last?.before ?? null)
      : current && { scale: current.scale, samples: current.samples };
    const next = learnScale(base, applied, shownMeters, enteredMeters);
    // The inputs of every correction, learned from or not, so a factor that
    // looks wrong can be traced to the entries that made it.
    const details = [
      `source: ${source}`,
      ...(runId != null ? [`run: ${runId}`] : []),
      ...(replacing ? ['replaces an earlier correction of this run'] : []),
      `factor applied on the watch: ${applied.toFixed(3)}`,
      `watch showed: ${Math.round(shownMeters)} m`,
      `watch raw (shown / applied): ${Math.round(shownMeters / applied)} m`,
      `entered: ${Math.round(enteredMeters)} m`,
      `factor before: ${base ? `${base.scale.toFixed(3)} (${base.samples} corrections)` : 'none'}`,
    ];
    if (!next && !replacing) {
      addLog(
        `[Watch Run] Indoor ${kind} correction taught nothing (no distance, or within 1% of what the watch showed)`,
        'INFO',
        details
      );
      return;
    }
    // A replacement that teaches nothing takes the run's earlier sample back
    // out, leaving the factor as it was before the run.
    const nextStored: Stored = { ...stored };
    if (next) {
      nextStored[kind] = {
        ...next,
        ...(runId != null && { last: { runId, before: base } }),
      };
    } else if (base) {
      nextStored[kind] = base;
    } else {
      delete nextStored[kind];
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextStored));
    addLog(
      next
        ? `[Watch Run] Indoor ${kind} distance factor now ${next.scale.toFixed(3)} (${next.samples} corrections)`
        : `[Watch Run] Indoor ${kind} correction took this run back out; factor is ${base ? base.scale.toFixed(3) : 'unlearned'}`,
      'INFO',
      details
    );
    listeners.forEach((listener) => listener());
  } catch (error) {
    addLog(
      `[Watch Run] Could not learn the indoor distance factor: ${String(error)}`,
      'WARNING'
    );
  }
}
