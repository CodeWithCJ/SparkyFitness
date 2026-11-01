import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import { addUserInteractionListener } from 'expo-widgets';
import type { LiveActivity, UserInteractionEvent } from 'expo-widgets';
import type { TFunction } from 'i18next';
import { intervalPosition } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import {
  getGpsRecordingSnapshot,
  markLap,
  pauseRecording,
  resumeRecording,
  subscribeGpsRecording,
  elapsedSeconds,
  type RecordingSnapshot,
} from './gpsRecordingService';
import { sendRunControl } from './watchRunControl';
import { addLog } from './LogService';
import { useLiveHeartRateStore } from '../stores/liveHeartRateStore';
import {
  useWatchRunLiveStore,
  WATCH_RUN_LIVE_MAX_AGE_MS,
  type WatchRunLive,
} from '../stores/watchRunLiveStore';
import {
  currentPaceSecondsPerUnit,
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  summarizeRecording,
  type DiaryActivity,
} from '../utils/gpsRecording';
import { intervalStepName } from '../utils/recordingCues';
import { notificationText } from '../utils/recordingNotification';
import { createConcurrencyLimiter } from '../utils/concurrency';
import RunLiveActivityFactory, {
  type RunLiveActivityProps,
} from './RunLiveActivityLayout';

/**
 * Keeps a Live Activity (Lock Screen and Dynamic Island) in step with a walk
 * or run in progress: the phone's GPS recording, or a run on the Apple Watch
 * that is reporting to the phone. The OS ticks the clock itself; distance, pace
 * and heart rate are pushed from here, at most every few seconds, while the app
 * is running (the location task keeps it alive for a phone recording). Display
 * only apart from the Pause/Resume and Lap buttons.
 *
 * A failure to start, update or end the activity must never touch the
 * recording, so every operation is caught and logged.
 */

const RECORD_ACTIVITY_URL = 'sparkyfitnessmobile://record-activity';
/** Button targets in RunLiveActivityLayout.tsx, kept in step by hand. */
const TOGGLE_TARGET = 'run-toggle';
const LAP_TARGET = 'run-lap';
/** Readings are repainted no more often than this; a state change goes at once. */
const MIN_REPAINT_MS = 5000;
/** A heart-rate reading older than this is not shown. */
const HEART_RATE_MAX_AGE_MS = 15_000;

interface Context {
  t: TFunction;
  distanceUnit: 'km' | 'miles';
}

let context: Context | null = null;
let initialized = false;
let activity: LiveActivity<RunLiveActivityProps> | null = null;
let lastSentProps: RunLiveActivityProps | null = null;
let lastSentAt = 0;
let appIconUri: string | null = null;
let appIconResolution: Promise<void> | null = null;
let unsubscribers: (() => void)[] = [];
let interactionSubscription: ReturnType<
  typeof addUserInteractionListener
> | null = null;
let repaintTimer: ReturnType<typeof setTimeout> | null = null;
let enqueue = createConcurrencyLimiter(1);

function logError(what: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  void addLog(`[RunLiveActivity] ${what}: ${message}`, 'ERROR');
}

/** The translated pieces of the activity, built where the language is known. */
function title(
  t: TFunction,
  activityKind: DiaryActivity,
  indoor: boolean
): string {
  switch (activityKind) {
    case 'walk':
      return indoor
        ? t('recordActivity.title.indoorWalk', { defaultValue: 'Indoor walk' })
        : t('recordActivity.title.outdoorWalk', {
            defaultValue: 'Outdoor walk',
          });
    case 'ride':
      return indoor
        ? t('recordActivity.title.indoorRide', { defaultValue: 'Indoor ride' })
        : t('recordActivity.title.outdoorRide', {
            defaultValue: 'Outdoor ride',
          });
    case 'jumpRope':
      return t('recordActivity.title.jumpRope', { defaultValue: 'Jump Rope' });
    default:
      return indoor
        ? t('recordActivity.title.indoorRun', { defaultValue: 'Indoor run' })
        : t('recordActivity.title.outdoorRun', { defaultValue: 'Outdoor run' });
  }
}

function unitLabels(ctx: Context) {
  const unit =
    ctx.distanceUnit === 'miles'
      ? ctx.t('recordActivity.unitMi', { defaultValue: 'mi' })
      : ctx.t('recordActivity.unitKm', { defaultValue: 'km' });
  return {
    unitMeters: ctx.distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM,
    unit,
    perUnit: ctx.t('recordActivity.perUnit', {
      defaultValue: '/{{unit}}',
      unit,
    }),
  };
}

function distanceText(ctx: Context, meters: number): string {
  const { unitMeters, unit } = unitLabels(ctx);
  return `${formatLocalizedNumber(meters / unitMeters, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${unit}`;
}

function paceText(ctx: Context, secondsPerUnit: number | null): string {
  return `${formatPace(secondsPerUnit)} ${unitLabels(ctx).perUnit}`;
}

function heartRateText(ctx: Context, bpm: number): string {
  return `${Math.round(bpm)} ${ctx.t('recordActivity.unitBpm', {
    defaultValue: 'bpm',
  })}`;
}

function buttonLabels(ctx: Context) {
  return {
    pauseLabel: ctx.t('recordActivity.pause', { defaultValue: 'Pause' }),
    resumeLabel: ctx.t('recordActivity.resume', { defaultValue: 'Resume' }),
    lapLabel: ctx.t('recordActivity.lap', { defaultValue: 'Lap' }),
  };
}

/** Props for the phone's own GPS recording, or null when there is none. */
export function computeRecordingProps(
  snapshot: RecordingSnapshot,
  ctx: Context,
  now: number,
  heartRate: { bpm: number; at: number; sessionId: string } | null
): RunLiveActivityProps | null {
  const { session, points } = snapshot;
  if (!session) return null;
  const { unitMeters } = unitLabels(ctx);
  const summary = summarizeRecording(points);
  const active = elapsedSeconds(session, now);
  const status: RunLiveActivityProps['status'] =
    session.status === 'finished'
      ? 'finished'
      : session.status === 'paused'
        ? 'paused'
        : 'running';
  const hasDistance = !session.indoor && points.length >= 2;
  const pace = hasDistance
    ? (currentPaceSecondsPerUnit(points, unitMeters, 100) ??
      paceSecondsPerUnit(summary.distanceMeters, active, unitMeters))
    : null;
  const position =
    session.intervals && status === 'running'
      ? intervalPosition(session.intervals.plan, active)
      : null;
  const stepLabel =
    position && !position.done
      ? ctx.t('recordActivity.liveActivity.step', {
          defaultValue: '{{name}} · {{current}} of {{total}}',
          name: intervalStepName(
            ctx.t,
            position.step.kind,
            session.intervals!.plan.style,
            position.step.effort
          ),
          current: position.index + 1,
          total: session.intervals!.plan.steps.length,
        })
      : null;
  const liveHr =
    heartRate &&
    heartRate.sessionId === session.id &&
    now - heartRate.at <= HEART_RATE_MAX_AGE_MS
      ? heartRate.bpm
      : null;
  return {
    title: title(ctx.t, session.activity, session.indoor === true),
    status,
    clockStartedAt: now - active * 1000,
    clockLabel: formatClock(active),
    statusLabel:
      status === 'finished'
        ? ctx.t('recordActivity.status.finished', { defaultValue: 'Finished' })
        : status === 'paused'
          ? session.autoPaused
            ? ctx.t('recordActivity.status.autoPaused', {
                defaultValue: 'Auto-paused',
              })
            : ctx.t('recordActivity.status.paused', { defaultValue: 'Paused' })
          : null,
    distanceLabel: hasDistance
      ? distanceText(ctx, summary.distanceMeters)
      : null,
    paceLabel: hasDistance ? paceText(ctx, pace) : null,
    heartRateLabel: liveHr != null ? heartRateText(ctx, liveHr) : null,
    stepLabel,
    canLap: !session.indoor || status === 'running',
    canToggle: status !== 'finished',
    ...buttonLabels(ctx),
  };
}

/** Props for a run on the watch that is reporting to the phone. */
export function computeWatchRunProps(
  run: WatchRunLive,
  ctx: Context,
  now: number
): RunLiveActivityProps | null {
  const age = Math.max(0, now - run.receivedAt);
  if (age > WATCH_RUN_LIVE_MAX_AGE_MS) return null;
  const { unitMeters } = unitLabels(ctx);
  const running = run.status === 'running';
  const active = run.elapsed + (running ? age / 1000 : 0);
  const hasDistance =
    run.kind !== 'jumpRope' &&
    (run.distanceMeters > 0 || run.place === 'outdoor');
  const stepRemaining =
    run.stepRemaining != null
      ? Math.max(0, run.stepRemaining - (running ? age / 1000 : 0))
      : null;
  return {
    title: title(ctx.t, run.kind, run.place === 'indoor'),
    status: running ? 'running' : 'paused',
    clockStartedAt: now - active * 1000,
    clockLabel: formatClock(active),
    statusLabel: running
      ? null
      : run.autoPaused
        ? ctx.t('recordActivity.status.autoPaused', {
            defaultValue: 'Auto-paused',
          })
        : ctx.t('recordActivity.status.paused', { defaultValue: 'Paused' }),
    distanceLabel: hasDistance ? distanceText(ctx, run.distanceMeters) : null,
    paceLabel: hasDistance
      ? paceText(
          ctx,
          paceSecondsPerUnit(run.distanceMeters, active, unitMeters)
        )
      : null,
    heartRateLabel:
      run.heartRate != null ? heartRateText(ctx, run.heartRate) : null,
    stepLabel:
      run.stepLabel != null
        ? stepRemaining != null
          ? `${run.stepLabel} · ${formatClock(stepRemaining)}`
          : run.stepLabel
        : null,
    canLap: true,
    canToggle: true,
    ...buttonLabels(ctx),
  };
}

type Source =
  | { kind: 'phone'; props: RunLiveActivityProps }
  | { kind: 'watch'; props: RunLiveActivityProps; runId: string }
  | null;

/** The phone's own recording wins; otherwise a watch run that is reporting. */
function currentSource(ctx: Context, now: number): Source {
  const reading = useLiveHeartRateStore.getState().reading;
  const recording = computeRecordingProps(
    getGpsRecordingSnapshot(),
    ctx,
    now,
    reading
      ? { bpm: reading.bpm, at: reading.at, sessionId: reading.sessionId }
      : null
  );
  if (recording) return { kind: 'phone', props: recording };
  const run = useWatchRunLiveStore.getState().run;
  const watch = run ? computeWatchRunProps(run, ctx, now) : null;
  return run && watch
    ? { kind: 'watch', props: watch, runId: run.runId }
    : null;
}

function propsEqual(a: RunLiveActivityProps, b: RunLiveActivityProps): boolean {
  return (
    a.title === b.title &&
    a.status === b.status &&
    a.statusLabel === b.statusLabel &&
    a.distanceLabel === b.distanceLabel &&
    a.paceLabel === b.paceLabel &&
    a.heartRateLabel === b.heartRateLabel &&
    a.stepLabel === b.stepLabel &&
    a.canLap === b.canLap &&
    a.canToggle === b.canToggle &&
    a.pauseLabel === b.pauseLabel &&
    a.resumeLabel === b.resumeLabel &&
    a.lapLabel === b.lapLabel &&
    a.appIconUri === b.appIconUri &&
    // The ticking clock only matters when it is shown as text, or when the
    // start moved by more than a second (a resume after a pause).
    (a.status === 'running'
      ? Math.abs(a.clockStartedAt - b.clockStartedAt) < 1500
      : a.clockLabel === b.clockLabel)
  );
}

async function resolveAppIcon(): Promise<void> {
  try {
    const container = Object.values(Paths.appleSharedContainers)[0];
    if (container == null) return;
    const asset = Asset.fromModule(
      require('../../assets/icons/live-activity-icon.png')
    );
    await asset.downloadAsync();
    if (asset.localUri == null) return;
    const destination = new File(container, 'run-live-activity-icon.png');
    if (destination.exists) destination.delete();
    new File(asset.localUri).copy(destination);
    appIconUri = destination.uri;
  } catch (error) {
    logError('app icon resolve failed', error);
  }
}

const withIcon = (props: RunLiveActivityProps): RunLiveActivityProps =>
  appIconUri != null ? { ...props, appIconUri } : props;

/** Brings the activity in line with `props` (null ends it). Runs in the queue. */
async function apply(props: RunLiveActivityProps | null): Promise<void> {
  if (props == null) {
    if (activity == null) return;
    await activity.end('immediate');
    activity = null;
    lastSentProps = null;
    return;
  }
  const final = withIcon(props);
  if (activity == null) {
    activity = RunLiveActivityFactory.start(final, RECORD_ACTIVITY_URL);
    lastSentProps = final;
    lastSentAt = Date.now();
    return;
  }
  if (lastSentProps != null && propsEqual(final, lastSentProps)) return;
  await activity.update(final);
  lastSentProps = final;
  lastSentAt = Date.now();
}

function sync(): void {
  if (!context) return;
  const ctx = context;
  void enqueue(async () => {
    const now = Date.now();
    const source = currentSource(ctx, now);
    const next = source?.props ?? null;
    // Readings change constantly; the next repaint waits out the interval
    // unless something other than a reading changed (state, step, labels).
    const quiet =
      next != null &&
      lastSentProps != null &&
      activity != null &&
      now - lastSentAt < MIN_REPAINT_MS &&
      next.status === lastSentProps.status &&
      next.statusLabel === lastSentProps.statusLabel &&
      next.title === lastSentProps.title &&
      next.stepLabel === lastSentProps.stepLabel;
    if (quiet) {
      scheduleRepaint(MIN_REPAINT_MS - (now - lastSentAt));
      return;
    }
    await apply(next);
  }).catch((error) => logError('sync failed', error));
}

/** One trailing repaint, so the last readings before a lull are not lost. */
function scheduleRepaint(inMs: number): void {
  if (repaintTimer != null) return;
  repaintTimer = setTimeout(
    () => {
      repaintTimer = null;
      sync();
    },
    Math.max(250, inMs)
  );
}

function handleInteraction(event: UserInteractionEvent): void {
  const ctx = context;
  if (!ctx || (event.target !== TOGGLE_TARGET && event.target !== LAP_TARGET)) {
    return;
  }
  const source = currentSource(ctx, Date.now());
  if (!source) return;
  const toggling = event.target === TOGGLE_TARGET;
  if (source.kind === 'phone') {
    const { session } = getGpsRecordingSnapshot();
    if (!session) return;
    const work = toggling
      ? session.status === 'recording'
        ? pauseRecording()
        : resumeRecording(notificationText(ctx.t, session.activity))
      : markLap();
    void work.catch((error: unknown) => logError('button failed', error));
    return;
  }
  const run = useWatchRunLiveStore.getState().run;
  if (!run) return;
  const action = toggling
    ? run.status === 'running'
      ? 'pause'
      : 'resume'
    : 'lap';
  void sendRunControl(source.runId, action).catch((error: unknown) =>
    logError('watch button failed', error)
  );
}

/**
 * Tells the service which language and distance unit to use. Called by a
 * headless component that follows the preferences, and again when either
 * changes; the activity repaints at once.
 */
export function configureRunLiveActivity(next: Context): void {
  const changed =
    context == null ||
    context.distanceUnit !== next.distanceUnit ||
    context.t !== next.t;
  context = next;
  if (changed && initialized) sync();
}

/** Starts following the recording and the watch run. Safe to call twice. */
export async function initRunLiveActivity(): Promise<void> {
  if (initialized) return;
  initialized = true;
  appIconResolution ??= resolveAppIcon();
  await appIconResolution;
  unsubscribers = [
    subscribeGpsRecording(sync),
    useWatchRunLiveStore.subscribe(sync),
    useLiveHeartRateStore.subscribe(sync),
  ];
  interactionSubscription = addUserInteractionListener(handleInteraction);
  // An activity left over from before the app was killed: adopt it if a run is
  // still going, otherwise end it.
  const instances = RunLiveActivityFactory.getInstances();
  if (instances.length > 0) {
    activity = instances[0] ?? null;
    for (const extra of instances.slice(1)) {
      void extra.end('immediate').catch((error) => logError('end', error));
    }
  }
  sync();
}

/** Test-only: drops all module state. */
export function __resetRunLiveActivityForTests(): void {
  unsubscribers.forEach((off) => off());
  unsubscribers = [];
  interactionSubscription?.remove();
  interactionSubscription = null;
  if (repaintTimer != null) clearTimeout(repaintTimer);
  repaintTimer = null;
  initialized = false;
  activity = null;
  lastSentProps = null;
  lastSentAt = 0;
  appIconUri = null;
  appIconResolution = null;
  context = null;
  enqueue = createConcurrencyLimiter(1);
}
