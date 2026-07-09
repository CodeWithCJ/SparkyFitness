import { Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

/**
 * Pale mint checkmark (= `hsl(146, 60%, 95%)`), held constant across every
 * theme by request — the checkmark should always read as a soft green, not
 * follow the success palette (whose surface tone inverts to a dark green in
 * dark/AMOLED). Hardcoded, like the plain white it replaced, precisely because
 * it is theme-independent. Kept as hex: the iOS SF Symbol's `tintColor` does
 * not parse `hsl()` strings and silently falls back to the system blue tint.
 */
const CHECK_COLOR = '#ebfaf1';

/**
 * Android stroke weight for the hand-drawn check (in the 24×24 viewBox). Bump
 * up for a heavier check, down for a lighter one — this is the Android
 * thickness knob, tuned to sit close to the iOS SF Symbol's `bold` check.
 */
const ANDROID_CHECK_STROKE = 3.5;

/**
 * The filled "done" badge — a `--color-icon-success` circle with a pale-green
 * checkmark (see {@link CHECK_COLOR}). Shared by every completion indicator on
 * the workout screens (set rows, exercise-card thumbnail, exercise rail) so
 * they all read as the exact same green; a done set row dims its content but
 * keeps this badge vivid.
 *
 * The check itself is platform-split on purpose: iOS renders the SF Symbol at
 * `bold`, which reads well, but Android's Ionicons checkmark has no weight
 * control and comes out too thin to read on the badge — so Android draws a
 * stroked check whose weight we set explicitly ({@link ANDROID_CHECK_STROKE}).
 */
export default function CompletionCheck({
  size = 28,
  iconSize,
  testID,
}: {
  /** Circle diameter in px. */
  size?: number;
  /** Checkmark size; defaults to ~0.57× the circle. */
  iconSize?: number;
  testID?: string;
}) {
  const successColor = String(useCSSVariable('--color-icon-success'));
  const glyphSize = iconSize ?? Math.round(size * 0.57);
  return (
    <View
      testID={testID}
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: successColor }}
    >
      {Platform.OS === 'android' ? (
        <Svg width={glyphSize} height={glyphSize} viewBox="0 0 24 24">
          <Path
            d="M4.5 12.5 L10 18 L19.5 6.5"
            fill="none"
            stroke={CHECK_COLOR}
            strokeWidth={ANDROID_CHECK_STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : (
        <Icon name="checkmark" size={glyphSize} color={CHECK_COLOR} weight="bold" />
      )}
    </View>
  );
}
