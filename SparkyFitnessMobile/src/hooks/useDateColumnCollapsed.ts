import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import SideBarMetricsModule, {
  watchOcclusion,
  type OcclusionEvent,
  type SideBarMetrics,
} from '../../modules/side-bar-metrics';
import {
  clusterHasActivity,
  statusRowCluster,
  verticalStripBottom,
} from '../utils/activeWorkoutHeaderLayout';

/** Height of the previous / calendar / next group when all three are shown. */
export const DATE_COLUMN_EXPANDED_HEIGHT = 152;
/** Clear space kept between the column and the Add button. */
export const DATE_COLUMN_MIN_GAP = 8;
/** How long to wait for a first reading before showing the full group. */
const SETTLE_TIMEOUT_MS = 2500;
/**
 * Right after a fold or rotation the layout is still moving: the Add button
 * lands up to about a second late, and a reading taken before that is wrong.
 * So for that long after a pose change an answer must hold this long before it
 * is accepted (the header shows its best guess meanwhile). A Live Activity
 * starting in a settled pose is accepted at once.
 */
const SETTLE_DEBOUNCE_MS = 1500;

/**
 * Whether the full three-button date group still fits between where iOS put
 * the column and the Add button. `null` means "could not measure" — callers
 * keep whatever they last decided.
 *
 * The column's top is the bottom of the status strip's reserved region (UIKit's
 * own answer, a running Live Activity included): the system starts the header
 * column right where that region ends. It is read from the region rather than
 * from the laid-out column so it exists before the header has any buttons, and
 * a first render cannot guess wrong and then jump. The laid-out column is only
 * the fallback where the region query is unavailable.
 */
export function dateColumnFits(
  m: SideBarMetrics | null | undefined,
  stripBottom: number | null = null
): boolean | null {
  const columnTop = stripBottom ?? m?.columnTop;
  if (columnTop == null || m?.addTop == null) return null;
  return (
    columnTop + DATE_COLUMN_EXPANDED_HEIGHT + DATE_COLUMN_MIN_GAP <= m.addTop
  );
}

/**
 * Whether a Live Activity was running the last time anything read the status
 * cluster, from either pose family. Shared by every screen that asks, and kept
 * across a rotation: the activity is the same one in both poses, so the tall
 * pose already says whether the wide pose will need the collapsed group.
 */
let activityHint: boolean | null = null;

/**
 * What was last decided for each side-bar pose family (the closed outer display
 * and the inner display's wide pose), per activity state. The outer display
 * parks the cluster lower, so it can need the collapsed group with no activity
 * at all; remembering that keeps a fold from showing the full group first.
 */
const decisions = new Map<string, boolean>();
const decisionKey = (width: number, activity: boolean | null) =>
  `${width < 500 ? 'outer' : 'inner'}:${activity}`;

/**
 * Where the Add button sits in each pose. It is a property of the pose, not of
 * the screen, but it can only be measured while a screen with the tab bar is
 * showing: with a workout open on top it is out of sight. Remembering it lets
 * a Live Activity starting or ending under another screen still be worked out,
 * so the date buttons are already right when the user comes back.
 */
const addTopByPose = new Map<string, number>();

/** First read after a pose change waits for the layout to settle. */
const POSE_SETTLE_MS = 1500;

/**
 * True when the date group must collapse to the calendar icon because a live
 * activity (or anything else that lengthens the status cluster) pushed the
 * column down onto the Add button. `active` is "a vertical bar is showing".
 *
 * The answer is never held back across a pose change: right after a fold or
 * rotation there is no reading for the new pose yet, and keeping the old
 * header there shows the wrong group (all three buttons, then a sudden one).
 * Instead it answers from `activityHint`, learned in the other pose, so the
 * header swaps once, straight to the final group, and the real reading only
 * confirms it. `null` is returned only when there is neither a reading nor a
 * hint (first launch straight into a side-bar pose), so the screen can wait
 * for one measurement instead of setting the full group and collapsing a
 * moment later. After a short wait with nothing it gives up and answers `false`.
 */
export function useDateColumnCollapsed(active: boolean): boolean | null {
  const { width, height } = useWindowDimensions();
  // A reading describes the pose it was taken in only.
  const poseKey = `${width}x${height}`;
  const [reading, setReading] = useState<{
    collapsed: boolean;
    poseKey: string;
  } | null>(null);
  const [timedOutKey, setTimedOutKey] = useState<string | null>(null);

  useEffect(() => {
    if (SideBarMetricsModule == null) return;
    // Effects re-run on every pose change, so this is when this pose began.
    const poseStartedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = ({
      regions,
      metrics,
      windowWidth,
      windowHeight,
    }: OcclusionEvent) => {
      // The native side can report a fold or rotation before this screen has
      // re-rendered with the new size, so a reading of another window size is
      // not this pose's answer. (The window size itself can lag a rotation;
      // the strip check below covers that.)
      if (
        Math.abs(windowWidth - width) > 1 ||
        Math.abs(windowHeight - height) > 1
      ) {
        return;
      }
      if (!active) {
        // Not beside a bar: only learn whether an activity is in the cluster.
        const hint = clusterHasActivity(
          statusRowCluster(regions, width),
          width
        );
        if (hint != null) activityHint = hint;
        return;
      }
      // Right after a fold the regions can still be the previous display's
      // (a strip at x=867 on a 466 pt window); such a reading is not this pose.
      const here = regions?.filter((r) => r.x < width && r.y < height) ?? null;
      if (regions != null && here != null && here.length < regions.length) {
        return;
      }
      // With region data but no strip in it, this is not a reading of this
      // pose (mid-rotation); the laid-out column is the previous pose's too, so
      // do not fall back to it. That fallback is only for an OS with no regions.
      const stripBottom = verticalStripBottom(here);
      if (here != null && stripBottom == null) return;
      if (metrics?.addTop != null) addTopByPose.set(poseKey, metrics.addTop);
      const fits = dateColumnFits(
        { ...metrics, addTop: metrics?.addTop ?? addTopByPose.get(poseKey) },
        stripBottom
      );
      if (fits == null) return;
      const commit = () => {
        decisions.set(decisionKey(width, activityHint), !fits);
        setReading({ collapsed: !fits, poseKey });
      };
      if (timer != null) clearTimeout(timer);
      timer = null;
      // The header is already showing its best guess when there is a hint, so
      // an unsettled first reading waits for quiet; without one, answer now.
      const unsettled =
        Date.now() - poseStartedAt < POSE_SETTLE_MS &&
        (activityHint != null ||
          decisions.has(decisionKey(width, activityHint)));
      if (unsettled) timer = setTimeout(commit, SETTLE_DEBOUNCE_MS);
      else commit();
    };
    const stop = watchOcclusion(onChange);
    const timeout = setTimeout(
      () => setTimedOutKey(poseKey),
      SETTLE_TIMEOUT_MS
    );
    return () => {
      stop();
      if (timer != null) clearTimeout(timer);
      clearTimeout(timeout);
    };
  }, [active, poseKey, width, height]);

  if (!active || SideBarMetricsModule == null) return false;
  if (reading?.poseKey === poseKey) return reading.collapsed;
  const remembered = decisions.get(decisionKey(width, activityHint));
  if (remembered != null) return remembered;
  if (activityHint != null) return activityHint;
  return timedOutKey === poseKey ? false : null;
}
