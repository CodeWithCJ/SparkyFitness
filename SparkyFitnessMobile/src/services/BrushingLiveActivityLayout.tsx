import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  clipShape,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  multilineTextAlignment,
  padding,
  resizable,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

/**
 * Live Activity for the brushing timer (#1862), on the Lock Screen, in the
 * Dynamic Island and in a paired Apple Watch's Smart Stack. Like the workout
 * and run ones, import it only from `brushingLiveActivity.ios.ts`:
 * `createLiveActivity` runs at module scope and would evaluate iOS-only native
 * modules in the Android bundle.
 *
 * While running, the OS ticks the clock towards `targetAt` (counting down, then
 * up once the target has passed). Every string arrives already translated.
 */
export type BrushingLiveActivityProps = {
  /** "Brushing timer". */
  title: string;
  running: boolean;
  /** Epoch ms the target time is reached, with pauses taken out. */
  targetAt: number;
  /** The clock as text while paused ("1:12"). */
  clockLabel: string;
  /** "Upper left", "Paused", "Done!". */
  statusLabel: string;
  /** file:// URI of the app icon in the shared app group container. */
  appIconUri?: string | null;
};

const BrushingLiveActivity = (props: BrushingLiveActivityProps) => {
  'widget';
  // The bundler serializes only this function body into the widget runtime, so
  // every helper must live inside it.
  const secondaryText = () =>
    foregroundStyle({ type: 'hierarchical', style: 'secondary' });

  const clock = (size: number, maxWidth: number) =>
    props.running ? (
      <Text
        date={new Date(props.targetAt)}
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

  const icon = () => <Image systemName="mouth" />;

  const status = (size: number) => (
    <Text modifiers={[font({ weight: 'semibold', size }), lineLimit(1)]}>
      {props.statusLabel}
    </Text>
  );

  return {
    banner: (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[padding({ horizontal: 16, vertical: 12 })]}
      >
        <HStack spacing={6}>
          {appIcon(16)}
          <Text modifiers={[secondaryText(), font({ size: 13 }), lineLimit(1)]}>
            {props.title}
          </Text>
          <Spacer />
        </HStack>
        <HStack>
          {status(20)}
          <Spacer />
          {clock(28, 110)}
        </HStack>
      </VStack>
    ),
    // Apple Watch Smart Stack (watchOS 11+) and CarPlay.
    bannerSmall: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ all: 8 })]}>
        <HStack>
          <Text modifiers={[font({ weight: 'bold', size: 13 }), lineLimit(1)]}>
            {props.title}
          </Text>
          <Spacer />
          {clock(13, 64)}
        </HStack>
        {status(13)}
      </VStack>
    ),
    compactLeading: appIcon(24) ?? icon(),
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
      <HStack modifiers={[padding({ horizontal: 12, bottom: 8 })]}>
        {status(16)}
        <Spacer />
      </HStack>
    ),
  };
};

export default createLiveActivity<BrushingLiveActivityProps>(
  'BrushingLiveActivity',
  BrushingLiveActivity
);
