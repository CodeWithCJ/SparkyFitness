import { useEffect, useState } from 'react';

import {
  elapsedSeconds,
  type RecordingSession,
} from '../services/gpsRecordingService';
import {
  estimateIndoorDistance,
  type IndoorDistanceEstimate,
} from '../services/stepDistance';

/**
 * The step-based distance for a finished indoor session, once the pedometer
 * has answered. Null until then, and for anything it cannot estimate, so the
 * screen simply shows an empty distance field the person fills in.
 */
export function useIndoorDistanceEstimate(
  session: RecordingSession | null
): IndoorDistanceEstimate | null {
  const [result, setResult] = useState<{
    id: string;
    estimate: IndoorDistanceEstimate | null;
  } | null>(null);

  const eligible =
    session != null &&
    session.indoor === true &&
    session.status === 'finished' &&
    session.finishedAt != null;
  const id = eligible ? session.id : null;
  const activity = eligible ? session.activity : null;
  const startedAt = eligible ? session.startedAt : null;
  const finishedAt = eligible ? session.finishedAt : null;
  const activeSeconds = eligible ? elapsedSeconds(session) : 0;
  const stepCounterAtStart = eligible ? session.stepCounterAtStart : undefined;

  useEffect(() => {
    if (id == null || activity == null) return;
    if (startedAt == null || finishedAt == null) return;
    let active = true;
    void estimateIndoorDistance({
      activity,
      startedAt,
      finishedAt,
      activeSeconds,
      ...(stepCounterAtStart != null && { stepCounterAtStart }),
    }).then((estimate) => {
      if (active) setResult({ id, estimate });
    });
    return () => {
      active = false;
    };
  }, [id, activity, startedAt, finishedAt, activeSeconds, stepCounterAtStart]);

  return result != null && result.id === id ? result.estimate : null;
}
