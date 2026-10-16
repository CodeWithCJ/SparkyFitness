import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import WatchConnectivity, {
  type WatchLiveHeartRatePayload,
  type WatchRecordingControlPayload,
  type WatchRecordingHeartRatePayload,
  type WatchRecordingStatePayload,
} from '../../modules/watch-connectivity';
import {
  addHeartRateSamples,
  elapsedSeconds,
  finishRecording,
  hydrate,
  markLap,
  noteLiveHeartRate,
  pauseRecording,
  resumeRecording,
  useGpsRecording,
  type RecordingSnapshot,
} from '../services/gpsRecordingService';
import { addLog } from '../services/LogService';
import { useLiveHeartRateStore } from '../stores/liveHeartRateStore';
import { notificationText } from '../utils/recordingNotification';
import {
  intervalStepName,
  stepDistanceText,
  stepLengthText,
} from '../utils/recordingCues';
import {
  currentPaceSecondsPerUnit,
  METERS_PER_KM,
  METERS_PER_MILE,
  summarizeRecording,
} from '../utils/gpsRecording';
import { intervalPosition } from '@workspace/shared';
import { usePreferences } from './usePreferences';

/** How often the watch's distance and pace are refreshed while recording. */
const LIVE_STATS_INTERVAL_MS = 3000;

type WatchStatus = WatchRecordingStatePayload['status'];

/**
 * Ties the phone's GPS recording to the Apple Watch. The phone still records
 * the route; the watch shows time, distance and pace, can pause, resume or
 * finish, and streams heart rate: live, for the recording screen, and in
 * batches, which are attached to the saved activity.
 *
 * Mounted headlessly (see `WatchWorkoutGate`), so controls from the wrist work
 * with the recording screen closed.
 */
export function useWatchRecordingBridge(enabled: boolean): void {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const unit: 'km' | 'mi' =
    preferences?.default_distance_unit === 'miles' ? 'mi' : 'km';
  const snapshot = useGpsRecording();
  const latest = useRef<RecordingSnapshot>(snapshot);
  const unitRef = useRef(unit);
  const tRef = useRef(t);
  // The last recording the watch was told about, so its end can be reported
  // after the session is gone from the store.
  const lastSent = useRef<{ id: string; status: WatchStatus } | null>(null);
  // The newest session seen, to tell a saved recording from a discarded one
  // once it has left the store: only a saved one has a diary entry id.
  const lastSession = useRef<RecordingSnapshot['session']>(null);

  // Declared first so the effects below read the current render's values.
  useEffect(() => {
    latest.current = snapshot;
    if (snapshot.session) lastSession.current = snapshot.session;
    unitRef.current = unit;
    tRef.current = t;
  });

  useEffect(() => {
    if (enabled) void hydrate();
  }, [enabled]);

  const buildState = (
    status: WatchStatus,
    snap: RecordingSnapshot
  ): WatchRecordingStatePayload | null => {
    const { session, points } = snap;
    if (!session) return null;
    const unitMeters =
      unitRef.current === 'mi' ? METERS_PER_MILE : METERS_PER_KM;
    const pace =
      status === 'recording'
        ? currentPaceSecondsPerUnit(points, unitMeters)
        : null;
    const distanceMeters = summarizeRecording(points).distanceMeters;
    const state: WatchRecordingStatePayload = {
      sessionId: session.id,
      activity: session.activity,
      indoor: session.indoor === true,
      status,
      startedAt: session.startedAt,
      pausedMs: session.pausedMs,
      distanceMeters: Math.round(distanceMeters),
      distanceUnit: unitRef.current,
      lapCount: session.laps?.length ?? 0,
      sentAt: Date.now(),
    };
    if (session.status === 'paused' && session.pausedAt != null) {
      state.pausedAt = session.pausedAt;
    }
    if (status === 'finished') {
      // Frozen clock: the watch computes elapsed from these two.
      state.pausedAt = session.finishedAt ?? Date.now();
    }
    if (pace != null) state.paceSeconds = Math.round(pace);
    if (session.intervals && status !== 'finished') {
      const position = intervalPosition(
        session.intervals.plan,
        elapsedSeconds(session),
        { cursor: session.intervals.cursor, meters: distanceMeters }
      );
      if (position) {
        const translate = tRef.current;
        state.intervalIndex = position.done
          ? session.intervals.plan.steps.length
          : position.index;
        const name = position.done
          ? translate('recordActivity.intervals.complete', {
              defaultValue: 'Intervals complete',
            })
          : intervalStepName(
              translate,
              position.step.kind,
              session.intervals.plan.style
            );
        // The watch counts time down on its own between updates; a distance
        // step has nothing to count, so its metres left ride in the label
        // (refreshed with every update) and the countdown is left off.
        state.intervalLabel =
          position.remainingMeters !== null && !position.done
            ? `${name} · ${stepDistanceText(translate, position.remainingMeters, position.step.unit)}`
            : name;
        state.intervalRemaining = Math.ceil(position.remaining);
        if (position.next && !position.done) {
          state.intervalNext = `${intervalStepName(
            translate,
            position.next.kind,
            session.intervals.plan.style
          )} ${stepLengthText(translate, position.next)}`;
        }
      }
    }
    return state;
  };

  // A status change goes out durably; a recording that ends (saved or
  // discarded, so the session leaves the store) tells the watch to close.
  const sessionId = snapshot.session?.id ?? null;
  const status = snapshot.session?.status ?? null;
  const intervalStep = snapshot.session?.intervals?.cued ?? null;
  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const snap = latest.current;
    if (snap.session) {
      const state = buildState(snap.session.status, snap);
      if (!state) return;
      lastSent.current = { id: snap.session.id, status: snap.session.status };
      void WatchConnectivity.updateRecordingState(state, true).catch(
        (error: unknown) => logError('send state', error)
      );
    } else if (lastSent.current) {
      // Saved or discarded: the session left the store.
      const saved =
        lastSession.current?.id === lastSent.current.id &&
        lastSession.current.savedEntryId != null;
      endRecording(lastSent.current.id, unitRef.current, !saved);
      lastSent.current = null;
      lastSession.current = null;
    }
  }, [enabled, sessionId, status]);

  // A new interval step goes out at once so its buzz is on time. Live only: a
  // durable send also relaunches the watch app, and the 3 s refresh covers a
  // watch that is out of reach for the moment.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || status !== 'recording') return;
    if (intervalStep === null || !WatchConnectivity.isReachable()) return;
    const state = buildState('recording', latest.current);
    if (!state) return;
    void WatchConnectivity.updateRecordingState(state, false).catch(
      (error: unknown) => logError('send interval step', error)
    );
  }, [enabled, status, intervalStep]);

  // Live distance and pace, only while recording and only to a reachable watch.
  useEffect(() => {
    if (!enabled || !WatchConnectivity || status !== 'recording') return;
    const timer = setInterval(() => {
      const snap = latest.current;
      const state = buildState('recording', snap);
      if (state && WatchConnectivity?.isReachable()) {
        void WatchConnectivity.updateRecordingState(state, false).catch(
          (error: unknown) => logError('send stats', error)
        );
      }
    }, LIVE_STATS_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, status, sessionId]);

  useEffect(() => {
    if (!enabled || !WatchConnectivity) return;
    const control = WatchConnectivity.addListener(
      'onRecordingControl',
      (payload: WatchRecordingControlPayload) => {
        const { session } = latest.current;
        if (!session || session.id !== payload.sessionId) return;
        const run =
          payload.action === 'pause'
            ? pauseRecording()
            : payload.action === 'resume'
              ? resumeRecording(
                  notificationText(tRef.current, session.activity)
                )
              : payload.action === 'finish'
                ? finishRecording()
                : payload.action === 'lap'
                  ? markLap(payload.at)
                  : null;
        run?.catch((error: unknown) => logError(payload.action, error));
      }
    );
    const heartRate = WatchConnectivity.addListener(
      'onRecordingHeartRate',
      (payload: WatchRecordingHeartRatePayload) => {
        const readings = (payload.samples ?? []).map((sample) => ({
          t: Date.parse(sample.t),
          bpm: sample.bpm,
        }));
        void addHeartRateSamples(
          payload.sessionId,
          payload.clientId,
          readings
        ).catch((error: unknown) => logError('store heart rate', error));
      }
    );
    // The wrist's current reading, display only. The batches above are what
    // reach the diary, so a dropped live message costs nothing.
    const live = WatchConnectivity.addListener(
      'onLiveHeartRate',
      (payload: WatchLiveHeartRatePayload) => {
        const { session } = latest.current;
        if (!session || session.id !== payload.sessionId) return;
        if (!(payload.bpm > 0) || !Number.isFinite(payload.at)) return;
        useLiveHeartRateStore.getState().record({
          sessionId: payload.sessionId,
          exerciseEntryId: payload.exerciseEntryId,
          bpm: Math.round(payload.bpm),
          at: payload.at,
        });
        // The range the runner set, if any, is judged on the same reading.
        void noteLiveHeartRate(payload.sessionId, payload.bpm);
      }
    );
    return () => {
      control.remove();
      heartRate.remove();
      live.remove();
    };
  }, [enabled]);
}

function endRecording(
  sessionId: string,
  unit: 'km' | 'mi',
  discarded: boolean
): void {
  void WatchConnectivity?.updateRecordingState(
    {
      sessionId,
      activity: 'walk',
      status: 'ended',
      startedAt: 0,
      pausedMs: 0,
      distanceMeters: 0,
      distanceUnit: unit,
      sentAt: Date.now(),
      discarded,
    },
    true
  ).catch((error: unknown) => logError('send end', error));
}

function logError(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  addLog(`[Watch Recording] Could not ${what}: ${message}`, 'WARNING');
}
