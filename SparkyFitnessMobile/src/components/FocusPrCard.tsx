import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import FullScreenModalBody from './FullScreenModalBody';
import Icon from './Icon';

/** How long the card stays up on its own, as the watch's banner does. */
export const PR_CARD_MS = 5000;

interface Props {
  visible: boolean;
  exerciseName: string;
  /** "85 kg × 8". */
  load: string;
  /** "+2.5 kg over your previous best of 82.5 kg"; null hides the line. */
  detail: { gain: string; previous: string } | null;
  onClose: () => void;
}

/**
 * The personal-record celebration (Phone-Pr board). It closes on its own
 * after about five seconds (the Continue button fills as it counts down),
 * or at once on Continue. Mounted per record so the timer restarts.
 */
function FocusPrCard({ visible, exerciseName, load, detail, onClose }: Props) {
  const { t } = useTranslation();
  const prColor = String(useCSSVariable('--color-pr'));
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const [secondsLeft, setSecondsLeft] = useState(PR_CARD_MS / 1000);

  useEffect(() => {
    if (!visible) return;
    progress.value = 0;
    if (!reducedMotion) {
      progress.value = withTiming(1, {
        duration: PR_CARD_MS,
        easing: Easing.linear,
      });
    }
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setSecondsLeft(
        Math.max(0, Math.ceil((PR_CARD_MS - (Date.now() - startedAt)) / 1000))
      );
    }, 250);
    const close = setTimeout(onClose, PR_CARD_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(close);
    };
  }, [visible, onClose, progress, reducedMotion]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <FullScreenModalBody className="px-4">
        <View className="flex-1 items-center justify-center">
          <View
            className="h-[120px] w-[120px] items-center justify-center rounded-full"
            style={{ backgroundColor: prColor }}
          >
            <Icon name="trophy-outline" size={64} color="#000" />
          </View>
          <Text
            className="mt-6 text-[13px] font-extrabold uppercase tracking-widest"
            style={{ color: prColor }}
          >
            {t('activeWorkout.focus.pr.label', {
              defaultValue: 'Personal record',
            })}
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-2 text-[44px] font-extrabold"
            style={{ color: prColor }}
          >
            {t('activeWorkout.focus.pr.title', { defaultValue: 'New PR!' })}
          </Text>
          <Text className="mt-2 text-center text-[20px] font-bold text-text-primary">
            {exerciseName}
          </Text>
          <Text
            testID="focus-pr-load"
            className="text-center text-[44px] font-extrabold text-text-primary"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {load}
          </Text>
          {detail != null && (
            <View className="mt-5 rounded-full bg-raised px-5 py-3">
              <Text className="text-center text-[15px] text-text-secondary">
                {t('activeWorkout.focus.pr.over', {
                  defaultValue:
                    '{{gain}} over your previous best of {{previous}}',
                  gain: detail.gain,
                  previous: detail.previous,
                })}
              </Text>
            </View>
          )}
        </View>
        <Pressable
          testID="focus-pr-continue"
          onPress={onClose}
          accessibilityRole="button"
          className="h-14 overflow-hidden rounded-full"
          style={{ backgroundColor: `${prColor}` }}
        >
          <Animated.View
            className="absolute inset-y-0 left-0"
            style={[{ backgroundColor: 'rgba(0,0,0,0.18)' }, fillStyle]}
          />
          <View className="flex-1 items-center justify-center">
            <Text className="text-[18px] font-bold text-black">
              {t('activeWorkout.focus.pr.continue', {
                defaultValue: 'Continue · {{seconds}} s',
                seconds: secondsLeft,
              })}
            </Text>
          </View>
        </Pressable>
        <Text className="mt-3 text-center text-[14px] text-text-secondary">
          {t('activeWorkout.focus.pr.autoClose', {
            defaultValue: 'Closes on its own after about 5 s',
          })}
        </Text>
      </FullScreenModalBody>
    </Modal>
  );
}

export default React.memo(FocusPrCard);
