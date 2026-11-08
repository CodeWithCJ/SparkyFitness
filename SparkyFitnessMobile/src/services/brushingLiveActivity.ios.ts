import { addLog } from './LogService';
import { copyLiveActivityIcon } from './liveActivityAppIcon';
import { createConcurrencyLimiter } from '../utils/concurrency';
import BrushingLiveActivityFactory, {
  type BrushingLiveActivityProps,
} from './BrushingLiveActivityLayout';

export interface BrushingActivityState {
  running: boolean;
  targetAt: number;
  clockLabel: string;
  statusLabel: string;
  title: string;
}

/**
 * Keeps the brushing timer's Live Activity in step with the timer: started on
 * the first show, updated on pause, resume and each quarter, ended when the
 * timer saves or closes. Display only. A failure never touches the timer, so
 * every operation is caught and logged, and calls run one at a time.
 */
const ORAL_CARE_URL = 'sparkyfitnessmobile://oral-care';

type Activity = ReturnType<typeof BrushingLiveActivityFactory.start>;
let activity: Activity | null = null;
let appIconUri: string | null | undefined;
const runExclusive = createConcurrencyLimiter(1);

function logError(what: string, error: unknown): void {
  addLog(
    `[BrushingLiveActivity] ${what}: ${error instanceof Error ? error.message : String(error)}`,
    'WARNING'
  );
}

async function apply(state: BrushingActivityState | null): Promise<void> {
  try {
    if (state == null) {
      // Also ends any activity left over from an earlier run of the app.
      for (const instance of BrushingLiveActivityFactory.getInstances()) {
        await instance.end('immediate').catch((e) => logError('end', e));
      }
      activity = null;
      return;
    }
    if (appIconUri === undefined) {
      appIconUri = await copyLiveActivityIcon(
        'brushing-live-activity-icon.png'
      ).catch((e) => {
        logError('app icon', e);
        return null;
      });
    }
    const props: BrushingLiveActivityProps = { ...state, appIconUri };
    if (activity == null) {
      activity = BrushingLiveActivityFactory.start(props, ORAL_CARE_URL);
      return;
    }
    await activity.update(props);
  } catch (error) {
    logError(state == null ? 'end' : 'show', error);
  }
}

export function showBrushingActivity(state: BrushingActivityState): void {
  void runExclusive(() => apply(state));
}

export function endBrushingActivity(): void {
  void runExclusive(() => apply(null));
}
