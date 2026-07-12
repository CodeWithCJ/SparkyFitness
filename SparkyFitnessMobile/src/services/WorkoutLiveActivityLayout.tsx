import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * Live Activity content for the active workout, rendered by the widget
 * extension on the Lock Screen and in the Dynamic Island. This module must
 * only ever be imported from `workoutLiveActivity.ios.ts` — `createLiveActivity`
 * runs at module scope and would evaluate iOS-only native modules in the
 * Android bundle.
 *
 * Timestamps are epoch-ms numbers, never `Date`s: props cross a JSON boundary
 * into the widget process, where the layout function reconstructs Dates. The
 * OS ticks the timer Texts itself, so no updates are needed while backgrounded.
 */
export type WorkoutLiveActivityProps = {
  workoutName: string;
  /** Epoch ms when the workout started — drives the system count-up timer. */
  startedAt: number;
  phase: 'active' | 'resting' | 'paused' | 'complete';
  /** Epoch ms when the current rest began (endsAt − duration); the countdown interval's lower bound. */
  restStartedAt: number | null;
  /** Epoch ms when the current rest ends. Non-null only while resting. */
  restEndsAt: number | null;
  /** Remaining rest as "M:SS", precomputed at pause time (no live tick while paused). */
  pausedRemainingLabel: string | null;
  /** Upcoming set, e.g. "Bench Press · Set 2 of 4". */
  setLine: string | null;
  /** Static elapsed clock captured when the last set completed — freezes the timer. */
  elapsedLabel: string | null;
};

const WorkoutLiveActivity = (props: WorkoutLiveActivityProps) => {
  'widget';
  // The bundler serializes only this function body into the widget runtime, so
  // every helper and constant must live inside it; only `@expo/ui/swift-ui`
  // imports resolve there.
  const secondaryText = () => foregroundStyle({ type: 'hierarchical', style: 'secondary' });

  const restInterval =
    props.phase === 'resting' && props.restStartedAt != null && props.restEndsAt != null
      ? { lower: new Date(props.restStartedAt), upper: new Date(props.restEndsAt) }
      : null;

  // OS-ticked timer Texts report an unbounded ideal width, which inflates the
  // compact Dynamic Island until it covers the status bar clock and battery.
  // The compact slot passes a cap; other regions lay out fine uncapped. The
  // elapsed cap must fit "H:MM:SS" from the start — nothing re-renders the
  // activity when the workout crosses the one-hour mark.
  const timerModifiers = (maxWidth?: number) =>
    maxWidth != null ? [monospacedDigit(), frame({ maxWidth })] : [monospacedDigit()];

  // Count-up workout clock; frozen to a static label once the workout is
  // complete so it doesn't read as "still going".
  const elapsedClock = (maxWidth?: number) =>
    props.phase === 'complete' ? (
      <Text modifiers={[monospacedDigit()]}>{props.elapsedLabel ?? ''}</Text>
    ) : (
      <Text date={new Date(props.startedAt)} dateStyle="timer" modifiers={timerModifiers(maxWidth)} />
    );

  const restCountdown = (maxWidth?: number) =>
    restInterval ? (
      <Text timerInterval={restInterval} countsDown modifiers={timerModifiers(maxWidth)} />
    ) : null;

  const statusLine = () => {
    if (restInterval) {
      return (
        <HStack spacing={4}>
          <Text modifiers={[secondaryText()]}>Rest</Text>
          {restCountdown()}
        </HStack>
      );
    }
    if (props.phase === 'paused') {
      return (
        <Text modifiers={[secondaryText()]}>
          Paused · {props.pausedRemainingLabel ?? ''}
        </Text>
      );
    }
    if (props.phase === 'complete') {
      return <Text modifiers={[secondaryText()]}>Workout complete</Text>;
    }
    return props.setLine != null ? (
      <Text modifiers={[secondaryText()]}>{props.setLine}</Text>
    ) : null;
  };

  const icon = () => <Image systemName="figure.strengthtraining.traditional" />;

  return {
    banner: (
      <VStack alignment="leading" spacing={4} modifiers={[padding({ all: 12 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 16 })]}>{props.workoutName}</Text>
          <Spacer />
          {elapsedClock()}
        </HStack>
        {statusLine()}
      </VStack>
    ),
    compactLeading: icon(),
    compactTrailing: restInterval ? restCountdown(48) : elapsedClock(64),
    minimal: icon(),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 12 })]}>
        {icon()}
        <Text modifiers={[font({ weight: 'bold' })]}>{props.workoutName}</Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 12 })]}>{elapsedClock()}</HStack>
    ),
    expandedBottom: (
      <HStack modifiers={[padding({ horizontal: 12, bottom: 8 })]}>
        {statusLine()}
        <Spacer />
      </HStack>
    ),
  };
};

export default createLiveActivity<WorkoutLiveActivityProps>(
  'WorkoutLiveActivity',
  WorkoutLiveActivity,
);
