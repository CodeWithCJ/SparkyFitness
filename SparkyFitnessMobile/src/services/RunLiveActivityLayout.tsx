import { Button, HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
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
 * Live Activity content for a walk or run in progress (the phone's GPS
 * recording, or a run on the Apple Watch), shown on the Lock Screen and in the
 * Dynamic Island. Like the workout one, this module must only be imported from
 * `runLiveActivity.ios.ts`: `createLiveActivity` runs at module scope and would
 * evaluate iOS-only native modules in the Android bundle.
 *
 * The clock is ticked by the OS from `clockStartedAt`; distance, pace and heart
 * rate are pushed by the app every few seconds. Every string arrives already
 * translated, since the layout cannot call i18next.
 */
export type RunLiveActivityProps = {
  /** "Outdoor run", "Indoor walk". */
  title: string;
  status: 'running' | 'paused' | 'finished';
  /** Epoch ms the clock would have started if it had never stopped; drives the count-up while running. */
  clockStartedAt: number;
  /** The clock as text, shown while paused or finished ("12:34"). */
  clockLabel: string;
  /** "Paused", "Auto-paused", "Finished"; null while running. */
  statusLabel: string | null;
  /** "2.41 km"; null when there is no distance to show (an indoor phone session). */
  distanceLabel: string | null;
  /** "5:12 /km" or "--:-- /km". */
  paceLabel: string | null;
  /** "148 bpm"; null with no recent reading. */
  heartRateLabel: string | null;
  /** The plan step in progress, e.g. "Fast · 2 of 5". */
  stepLabel: string | null;
  /** Button text and accessibility labels. */
  pauseLabel: string;
  resumeLabel: string;
  lapLabel: string;
  /** Whether the Lap button is offered (a run that is going). */
  canLap: boolean;
  /** Pause or resume is offered unless the recording is finished. */
  canToggle: boolean;
  /** file:// URI of the app icon in the shared app group container. */
  appIconUri?: string | null;
};

const RunLiveActivity = (props: RunLiveActivityProps) => {
  'widget';
  // The bundler serializes only this function body into the widget runtime, so
  // every helper and constant must live inside it.
  const secondaryText = () =>
    foregroundStyle({ type: 'hierarchical', style: 'secondary' });

  const running = props.status === 'running';

  // The OS-ticked clock while running; text while paused or finished. A
  // ticking timer claims all leftover width, so it gets a trailing-aligned cap.
  const clock = (size: number, maxWidth: number) =>
    running ? (
      <Text
        date={new Date(props.clockStartedAt)}
        dateStyle="timer"
        modifiers={[
          font({ weight: 'semibold', size }),
          monospacedDigit(),
          multilineTextAlignment('trailing'),
          minimumScaleFactor(0.8),
          frame({ maxWidth, alignment: 'trailing' }),
        ]}
      />
    ) : (
      <Text modifiers={[font({ weight: 'semibold', size }), monospacedDigit()]}>
        {props.clockLabel}
      </Text>
    );

  const appIcon = (size: number) =>
    props.appIconUri != null ? (
      <Image
        uiImage={props.appIconUri}
        modifiers={[
          resizable(),
          frame({ width: size, height: size }),
          clipShape('circle'),
        ]}
      />
    ) : null;

  const icon = () => <Image systemName="figure.run" />;

  const buttonModifiers = (label: string, prominent: boolean) => [
    buttonStyle(prominent ? 'borderedProminent' : 'bordered'),
    buttonBorderShape('capsule'),
    controlSize('regular'),
    accessibilityLabel(label),
  ];

  // A press runs a LiveActivityIntent in the app process; runLiveActivity.ios.ts
  // matches on these targets, which must stay in sync with that file.
  const toggleButton = () =>
    props.canToggle ? (
      <Button
        target="run-toggle"
        modifiers={buttonModifiers(
          running ? props.pauseLabel : props.resumeLabel,
          true
        )}
      >
        <Image
          systemName={running ? 'pause.fill' : 'play.fill'}
          modifiers={[font({ weight: 'bold', size: 18 })]}
        />
      </Button>
    ) : null;

  const lapButton = () =>
    props.canLap && running ? (
      <Button
        target="run-lap"
        modifiers={buttonModifiers(props.lapLabel, false)}
      >
        <Image
          systemName="flag.fill"
          modifiers={[font({ weight: 'bold', size: 16 })]}
        />
      </Button>
    ) : null;

  const statusLine = () =>
    props.statusLabel != null ? (
      <Text modifiers={[font({ weight: 'semibold', size: 14 }), lineLimit(1)]}>
        {props.statusLabel}
      </Text>
    ) : props.stepLabel != null ? (
      <Text modifiers={[secondaryText(), font({ size: 14 }), lineLimit(1)]}>
        {props.stepLabel}
      </Text>
    ) : null;

  // The readings: distance large, pace and heart rate beside it.
  const readings = () => (
    <HStack spacing={14}>
      {props.distanceLabel != null ? (
        <Text
          modifiers={[
            font({ weight: 'bold', size: 26 }),
            monospacedDigit(),
            lineLimit(1),
            minimumScaleFactor(0.7),
          ]}
        >
          {props.distanceLabel}
        </Text>
      ) : null}
      {props.paceLabel != null ? (
        <Text
          modifiers={[
            font({ weight: 'semibold', size: 17 }),
            monospacedDigit(),
            lineLimit(1),
            minimumScaleFactor(0.7),
          ]}
        >
          {props.paceLabel}
        </Text>
      ) : null}
      {props.heartRateLabel != null ? (
        <Text
          modifiers={[
            font({ weight: 'semibold', size: 17 }),
            monospacedDigit(),
            lineLimit(1),
            foregroundStyle('#FF3B30'),
          ]}
        >
          {props.heartRateLabel}
        </Text>
      ) : null}
    </HStack>
  );

  const header = () => (
    <HStack spacing={6}>
      {appIcon(16)}
      <Text modifiers={[secondaryText(), font({ size: 13 }), lineLimit(1)]}>
        {props.title}
      </Text>
      <Spacer />
      <HStack modifiers={[layoutPriority(1)]}>{clock(15, 64)}</HStack>
    </HStack>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ horizontal: 16, vertical: 12 })]}
      >
        {header()}
        {statusLine()}
        <HStack>
          {readings()}
          <Spacer />
          <HStack spacing={8}>
            {lapButton()}
            {toggleButton()}
          </HStack>
        </HStack>
      </VStack>
    ),
    // Watch Smart Stack (watchOS 11+) and CarPlay: no buttons.
    bannerSmall: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 8 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 13 }), lineLimit(1)]}>
            {props.title}
          </Text>
          <Spacer />
          {clock(13, 64)}
        </HStack>
        {props.distanceLabel != null ? (
          <Text modifiers={[font({ size: 13 }), lineLimit(1)]}>
            {props.distanceLabel}
            {props.paceLabel != null ? ` · ${props.paceLabel}` : ''}
          </Text>
        ) : null}
      </VStack>
    ),
    compactLeading: appIcon(24),
    compactTrailing: clock(14, 52),
    minimal: appIcon(22) ?? icon(),
    expandedLeading: (
      <HStack spacing={6} modifiers={[padding({ leading: 12 })]}>
        {appIcon(22) ?? icon()}
        <Text modifiers={[font({ weight: 'bold' }), lineLimit(1)]}>
          {props.title}
        </Text>
      </HStack>
    ),
    expandedTrailing: (
      <HStack modifiers={[padding({ trailing: 12 })]}>{clock(18, 72)}</HStack>
    ),
    expandedBottom: (
      <VStack spacing={6} modifiers={[padding({ horizontal: 12, bottom: 8 })]}>
        {statusLine()}
        <HStack>
          {readings()}
          <Spacer />
          <HStack spacing={8}>
            {lapButton()}
            {toggleButton()}
          </HStack>
        </HStack>
      </VStack>
    ),
  };
};

export default createLiveActivity<RunLiveActivityProps>(
  'RunLiveActivity',
  RunLiveActivity
);
