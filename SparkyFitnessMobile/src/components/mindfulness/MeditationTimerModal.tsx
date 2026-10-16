import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import FullScreenModalBody from '../FullScreenModalBody';
import Icon from '../Icon';
import { useSaveOncePerRun } from '../../hooks/useSaveOncePerRun';

interface MeditationTimerModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (
    durationSeconds: number,
    sessionType: string
  ) => void | Promise<unknown>;
}

const PRESET_MINUTES = [5, 10, 15, 20];

export const MeditationTimerModal: React.FC<MeditationTimerModalProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [selectedMinutes, setSelectedMinutes] = useState(10);
  const [isActive, setIsActive] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(10 * 60);
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    try {
      Haptics.impactAsync(style);
    } catch {
      // Haptics not supported
    }
  }, []);

  const resetState = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsActive(false);
    setSecondsRemaining(selectedMinutes * 60);
    setStopwatchSeconds(0);
  }, [selectedMinutes]);

  const handleSelectMinutes = (mins: number) => {
    setSelectedMinutes(mins);
    if (!isActive) {
      setSecondsRemaining(mins * 60);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  useEffect(() => {
    if (!isActive) return;

    timerRef.current = setInterval(() => {
      if (mode === 'countdown') {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current as NodeJS.Timeout);
            setIsActive(false);
            triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
            return 0;
          }
          return prev - 1;
        });
      } else {
        setStopwatchSeconds((prev) => prev + 1);
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, mode, triggerHaptic]);

  const toggleStartPause = () => {
    if (isActive) {
      setIsActive(false);
    } else {
      setIsActive(true);
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    }
  };

  const canFinish =
    (mode === 'countdown' && secondsRemaining < selectedMinutes * 60) ||
    (mode === 'stopwatch' && stopwatchSeconds > 0);
  // Finish stays on screen while the save runs: one run is logged once. The
  // run is the time on either clock: switching to the unused one hides Finish
  // but keeps the run, so it must not end the run whose save is pending.
  const saveRunOnce = useSaveOncePerRun(
    secondsRemaining < selectedMinutes * 60 || stopwatchSeconds > 0
  );
  const handleFinish = () => {
    const finalSeconds =
      mode === 'countdown'
        ? selectedMinutes * 60 - secondsRemaining
        : stopwatchSeconds;
    return saveRunOnce(
      () => onSave(finalSeconds, 'meditation'),
      () => {
        resetState();
        onClose();
      }
    );
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <FullScreenModalBody className="justify-between px-6">
        {/* Header */}
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-text-primary text-xl font-bold">
              {t('mindfulness.timer.title', {
                defaultValue: 'Meditation Timer',
              })}
            </Text>
            <Text className="text-text-secondary text-xs mt-0.5">
              {mode === 'countdown'
                ? t('mindfulness.timer.countdownSubtitle', {
                    defaultValue: 'Timed meditation session',
                  })
                : t('mindfulness.timer.stopwatchSubtitle', {
                    defaultValue: 'Open contemplation session',
                  })}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleClose}
            className="p-2 rounded-full bg-surface border border-border-subtle"
            accessibilityRole="button"
            accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
          >
            <Icon name="close" size={20} color={textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Mode Switcher (only when paused) */}
        {!isActive && (
          <View className="flex-row justify-center gap-3 my-2">
            <TouchableOpacity
              onPress={() => setMode('countdown')}
              className={`px-4 py-2 rounded-full border ${
                mode === 'countdown'
                  ? 'bg-purple-500/20 border-purple-500'
                  : 'bg-surface border-border-subtle'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  mode === 'countdown'
                    ? 'text-purple-600 dark:text-purple-300'
                    : 'text-text-secondary'
                }`}
              >
                {t('mindfulness.timer.countdown', {
                  defaultValue: 'Countdown',
                })}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setMode('stopwatch')}
              className={`px-4 py-2 rounded-full border ${
                mode === 'stopwatch'
                  ? 'bg-purple-500/20 border-purple-500'
                  : 'bg-surface border-border-subtle'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  mode === 'stopwatch'
                    ? 'text-purple-600 dark:text-purple-300'
                    : 'text-text-secondary'
                }`}
              >
                {t('mindfulness.timer.openStopwatch', {
                  defaultValue: 'Open Stopwatch',
                })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Presets (only in countdown mode when not active) */}
        {mode === 'countdown' && !isActive && (
          <View className="flex-row justify-center gap-2">
            {PRESET_MINUTES.map((mins) => (
              <TouchableOpacity
                key={mins}
                onPress={() => handleSelectMinutes(mins)}
                className={`px-3 py-1.5 rounded-xl border ${
                  selectedMinutes === mins
                    ? 'bg-purple-500/20 border-purple-500'
                    : 'bg-surface border-border-subtle'
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    selectedMinutes === mins
                      ? 'text-purple-600 dark:text-purple-300'
                      : 'text-text-secondary'
                  }`}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Clock Display */}
        <View className="items-center justify-center my-auto">
          <View className="w-64 h-64 rounded-full border-2 border-purple-500/30 bg-purple-500/10 items-center justify-center shadow-lg shadow-purple-500/20">
            <Text className="text-text-primary text-5xl font-mono font-bold tracking-widest">
              {mode === 'countdown'
                ? formatTime(secondsRemaining)
                : formatTime(stopwatchSeconds)}
            </Text>
            <Text className="text-purple-600 dark:text-purple-300 text-sm mt-3 font-medium">
              {isActive
                ? t('mindfulness.timer.meditating', {
                    defaultValue: 'Meditating...',
                  })
                : t('mindfulness.timer.peaceful', {
                    defaultValue: 'Find a comfortable seat',
                  })}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={toggleStartPause}
            className={`flex-1 py-4 rounded-2xl items-center ${
              isActive ? 'bg-amber-600' : 'bg-purple-600'
            }`}
            accessibilityRole="button"
          >
            <Text className="text-white font-bold text-base">
              {isActive
                ? t('mindfulness.timer.pause', { defaultValue: 'Pause' })
                : (mode === 'countdown' &&
                      secondsRemaining < selectedMinutes * 60) ||
                    (mode === 'stopwatch' && stopwatchSeconds > 0)
                  ? t('mindfulness.timer.resume', { defaultValue: 'Resume' })
                  : t('mindfulness.timer.start', {
                      defaultValue: 'Begin Meditation',
                    })}
            </Text>
          </TouchableOpacity>

          {canFinish && (
            <TouchableOpacity
              onPress={handleFinish}
              className="flex-1 bg-emerald-600 py-4 rounded-2xl items-center"
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-base">
                {t('mindfulness.timer.finishAndSave', {
                  defaultValue: 'Finish & Save',
                })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </FullScreenModalBody>
    </Modal>
  );
};
