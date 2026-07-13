import { Button, HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  clipped,
  clipShape,
  controlSize,
  font,
  foregroundStyle,
  frame,
  layoutPriority,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
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
  /**
   * file:// URI of the app icon in the shared app group container. The widget
   * process can't read the app's asset catalog or bundle, so the service
   * copies the icon there and injects the URI; absent until that resolves.
   */
  appIconUri?: string | null;
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

  // OS-ticked timer Texts report an unbounded ideal width, which inflates
  // whatever slot holds them. The small watch/CarPlay banner passes a fixed
  // cap that must fit "H:MM:SS" from the start — the format can grow between
  // repaints, and a too-small cap truncates the digits.
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

  // The single labeled timer slot: rest countdown while resting (the frozen
  // remainder while paused), elapsed clock otherwise — never both at once.
  // Two live timers tick on different subsecond boundaries and read as
  // glitchy side by side, so only one is ever visible.
  //
  // OS-ticked timer Texts greedily claim all leftover row width (an uncapped
  // one strands a sibling label far from the digits), so ticking digits get
  // a trailing-aligned width cap with multilineTextAlignment pinning them to
  // the right edge. Nested-Text concatenation is no escape — the widget
  // renderer rebuilds children as WidgetsDynamicView, which TextView's `+`
  // reduce silently drops, rendering nothing at all.
  const labeledTimer = () => {
    const valueFont = [font({ weight: 'semibold', size: 16 }), monospacedDigit()];
    const labelStyle = [secondaryText(), font({ size: 16 })];
    if (restInterval) {
      // Cap sized from the rest length at push time: the countdown only
      // shrinks between repaints, so the format can't outgrow it. The scale
      // factor is a parachute for font-metric drift — slightly smaller digits
      // beat a truncated "…".
      const restCap = (props.restEndsAt ?? 0) - (props.restStartedAt ?? 0) >= 600_000 ? 50 : 40;
      return (
        <HStack spacing={5} modifiers={[layoutPriority(1)]}>
          <Text modifiers={labelStyle}>Rest</Text>
          <Text
            timerInterval={restInterval}
            countsDown
            modifiers={[
              ...valueFont,
              multilineTextAlignment('trailing'),
              minimumScaleFactor(0.9),
              frame({ maxWidth: restCap, alignment: 'trailing' }),
            ]}
          />
        </HStack>
      );
    }
    if (props.phase === 'paused' || props.phase === 'complete') {
      return (
        <HStack spacing={5} modifiers={[layoutPriority(1)]}>
          <Text modifiers={labelStyle}>{props.phase === 'paused' ? 'Paused' : 'Elapsed'}</Text>
          <Text modifiers={valueFont}>
            {(props.phase === 'paused' ? props.pausedRemainingLabel : props.elapsedLabel) ?? ''}
          </Text>
        </HStack>
      );
    }
    // The ticking elapsed clock keeps a stacked caption instead of an inline
    // label: its format grows across the one-hour boundary between repaints,
    // so a snug inline cap could truncate the digits while a safe wide one
    // leaves a floating gap after the label.
    return (
      <VStack alignment="trailing" spacing={1} modifiers={[layoutPriority(1)]}>
        <Text modifiers={[secondaryText(), font({ size: 12 })]}>Elapsed</Text>
        <Text
          date={new Date(props.startedAt)}
          dateStyle="timer"
          modifiers={[
            ...valueFont,
            multilineTextAlignment('trailing'),
            minimumScaleFactor(0.9),
            frame({ maxWidth: 64, alignment: 'trailing' }),
          ]}
        />
      </VStack>
    );
  };

  // OS-ticked depleting bar over the rest interval — like the timer Texts, the
  // system animates it from the absolute dates with no updates from the app.
  // @expo/ui exposes no way to suppress the bar's built-in remaining-time
  // label (SwiftUI needs an explicit empty currentValueLabel), and it would
  // duplicate the rest countdown above — pin the frame to the bar's own
  // height and clip the label away.
  const restProgress = () =>
    restInterval ? (
      <ProgressView
        timerInterval={restInterval}
        modifiers={[frame({ height: 6, alignment: 'top' }), clipped()]}
      />
    ) : null;

  // Primary label color, matching notification body text — the hierarchical
  // secondary style washes out against the Lock Screen material.
  const statusLine = () => {
    if (props.phase === 'complete') {
      return <Text>Workout complete</Text>;
    }
    return props.setLine != null ? (
      <Text modifiers={[lineLimit(1)]}>{props.setLine}</Text>
    ) : null;
  };

  const icon = () => <Image systemName="figure.strengthtraining.traditional" />;

  // App-icon identity for the island slots; null (→ SF-symbol or empty
  // fallback) until the service has copied the icon into the app group.
  const appIcon = (size: number) =>
    props.appIconUri != null ? (
      <Image
        uiImage={props.appIconUri}
        modifiers={[resizable(), frame({ width: size, height: size }), clipShape('circle')]}
      />
    ) : null;

  // The compact Dynamic Island pill hugs its content, so a width cap sized
  // for the widest possible format reads as dead space beside the digits.
  // The system controls the ticking format (M:SS → MM:SS → H:MM:SS; hours
  // can't be dropped), so instead the cap is tiered from the actual value —
  // this code re-runs in the widget process on every repaint. Crossing a
  // format boundary mid-set (10:00 or 1:00:00 with no state change to
  // repaint) lands on the scale factor, which shrinks the digits slightly
  // until the next repaint re-tiers the cap.
  const compactTimer = () => {
    const tickingModifiers = (maxWidth: number) => [
      monospacedDigit(),
      minimumScaleFactor(0.75),
      frame({ maxWidth }),
    ];
    if (restInterval) {
      const cap = (props.restEndsAt ?? 0) - (props.restStartedAt ?? 0) >= 600_000 ? 48 : 38;
      return <Text timerInterval={restInterval} countsDown modifiers={tickingModifiers(cap)} />;
    }
    if (props.phase === 'complete') {
      return <Text modifiers={[monospacedDigit()]}>{props.elapsedLabel ?? ''}</Text>;
    }
    const elapsedMs = Date.now() - props.startedAt;
    const cap = elapsedMs >= 3_300_000 ? 64 : elapsedMs >= 570_000 ? 48 : 38;
    return <Text date={new Date(props.startedAt)} dateStyle="timer" modifiers={tickingModifiers(cap)} />;
  };

  // Phase controls (iOS 17+). A press runs a LiveActivityIntent in the app
  // process; workoutLiveActivity.ios.ts matches on these target strings and
  // pushes the repaint, so the targets must stay in sync with that file.
  //
  // Bare tinted buttons — no background wash. The add-rest label is text
  // ("+15s", matching the in-app rest bar) because SF Symbols' goforward.15
  // family means media seek, which reads as skipping rest, not extending it.
  const restButtonModifiers = (label: string) => [
    buttonStyle('borderless'),
    controlSize('large'),
    accessibilityLabel(label),
  ];
  // Both labels share one font so the SF Symbol scales to match the text.
  const restButtonFont = font({ weight: 'semibold', size: 17 });
  const actionButtons = () => {
    if (restInterval) {
      return (
        <HStack spacing={8}>
          <Button target="rest-add-15" modifiers={restButtonModifiers('Add 15 seconds')}>
            <Text modifiers={[restButtonFont, monospacedDigit()]}>+15s</Text>
          </Button>
          <Button target="rest-skip" modifiers={restButtonModifiers('Skip rest')}>
            <Image systemName="forward.end.fill" modifiers={[restButtonFont]} />
          </Button>
        </HStack>
      );
    }
    if (props.phase === 'active' && props.setLine != null) {
      return (
        <Button
          label="Complete"
          systemImage="checkmark"
          target="complete-set"
          modifiers={[buttonStyle('bordered'), buttonBorderShape('capsule'), controlSize('regular')]}
        />
      );
    }
    return null;
  };

  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 16 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 16 }), lineLimit(1)]}>
            {props.workoutName}
          </Text>
          <Spacer />
          {labeledTimer()}
        </HStack>
        <HStack>
          {statusLine()}
          <Spacer />
          {actionButtons()}
        </HStack>
        {restProgress()}
      </VStack>
    ),
    // Watch Smart Stack (watchOS 11+) and CarPlay. No buttons: the layout can
    // render on a remote device, where LiveActivityIntent presses are unproven.
    bannerSmall: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 8 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 13 }), lineLimit(1)]}>
            {props.workoutName}
          </Text>
          <Spacer />
          {restInterval ? restCountdown(48) : elapsedClock(64)}
        </HStack>
        {statusLine()}
        {restProgress()}
      </VStack>
    ),
    compactLeading: appIcon(24),
    compactTrailing: compactTimer(),
    minimal: appIcon(22) ?? icon(),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 12 })]}>
        {appIcon(22) ?? icon()}
        <Text modifiers={[font({ weight: 'bold' })]}>{props.workoutName}</Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 12 })]}>{labeledTimer()}</HStack>
    ),
    expandedBottom: (
      <VStack spacing={6} modifiers={[padding({ horizontal: 12, bottom: 8 })]}>
        <HStack>
          {statusLine()}
          <Spacer />
          {actionButtons()}
        </HStack>
        {restProgress()}
      </VStack>
    ),
  };
};

export default createLiveActivity<WorkoutLiveActivityProps>(
  'WorkoutLiveActivity',
  WorkoutLiveActivity,
);
