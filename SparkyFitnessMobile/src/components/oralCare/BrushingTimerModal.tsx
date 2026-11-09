import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import FullScreenModalBody from '../FullScreenModalBody';
import ProgressRing from '../ProgressRing';
import Icon from '../Icon';
import { useSaveOncePerRun } from '../../hooks/useSaveOncePerRun';
import { fireImpactHaptic, fireSuccessHaptic } from '../../services/haptics';
import { playIntervalCue, playRestCompleteSound } from '../../services/sounds';
import {
  cancelBrushingTimerNotification,
  scheduleBrushingTimerNotification,
} from '../../services/notifications';
import {
  endBrushingActivity,
  showBrushingActivity,
} from '../../services/brushingLiveActivity';
import { brushingQuadrant } from '@workspace/shared';
import { formatOralCareClock } from '../../utils/oralCare';

const KEEP_AWAKE_TAG = 'brushing-timer';
const RING_SIZE = 256;
const RING_STROKE = 14;
/** sky-500 and a faint track of it, readable in light and dark themes. */
const RING_COLOR = '#0ea5e9';
const RING_TRACK = 'rgba(14, 165, 233, 0.15)';

interface BrushingTimerModalProps {
  visible: boolean;
  /** The goal's time per brush; the timer moves to the next quarter every quarter of it. */
  targetSeconds: number;
  onClose: () => void;
  /** Saves the brush; rejecting keeps the timer open so Done can retry. */
  onSave: (startedAt: Date, durationSeconds: number) => Promise<unknown>;
}

/**
 * A brushing timer: the target time split into four quarters of the mouth,
 * with a tap and a soft chime at each change and the workout rest chime at the
 * target (both follow the rest timer sound setting). Time comes from the wall
 * clock, so a backgrounded app still counts it; a notification is scheduled for
 * the target in case the app is not open then, and a Live Activity shows the
 * clock on the Lock Screen, in the Dynamic Island and on a paired Apple Watch.
 */
export const BrushingTimerModal: React.FC<BrushingTimerModalProps> = ({
  visible,
  targetSeconds,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const startedAtRef = useRef<Date | null>(null);
  // Milliseconds counted before the current run of the clock (pauses split runs).
  const bankedMsRef = useRef(0);
  const runStartMsRef = useRef<number | null>(null);
  const lastQuadrantRef = useRef(0);

  const currentMs = useCallback(
    () =>
      bankedMsRef.current +
      (runStartMsRef.current !== null ? Date.now() - runStartMsRef.current : 0),
    []
  );

  const quadrantLabel = useCallback(
    (quadrant: number) =>
      [
        t('oralCare.timer.upperLeft', { defaultValue: 'Upper left' }),
        t('oralCare.timer.upperRight', { defaultValue: 'Upper right' }),
        t('oralCare.timer.lowerRight', { defaultValue: 'Lower right' }),
        t('oralCare.timer.lowerLeft', { defaultValue: 'Lower left' }),
        t('oralCare.timer.doneShort', { defaultValue: 'Done!' }),
      ][quadrant] ?? '',
    [t]
  );

  /** Brings the Live Activity and the target notification in line with the clock. */
  const syncOutsideApp = useCallback(
    (isRunning: boolean) => {
      const elapsedSeconds = currentMs() / 1000;
      const remainingSeconds = targetSeconds - elapsedSeconds;
      const title = t('oralCare.timer.title', {
        defaultValue: 'Brushing timer',
      });
      showBrushingActivity({
        title,
        running: isRunning,
        targetAt: Date.now() + remainingSeconds * 1000,
        clockLabel: formatOralCareClock(
          remainingSeconds > 0 ? remainingSeconds : elapsedSeconds
        ),
        statusLabel: isRunning
          ? quadrantLabel(
              brushingQuadrant(Math.floor(elapsedSeconds), targetSeconds)
            )
          : t('oralCare.timer.paused', { defaultValue: 'Paused' }),
      });
      if (isRunning && remainingSeconds > 0) {
        void scheduleBrushingTimerNotification(remainingSeconds);
      } else {
        void cancelBrushingTimerNotification();
      }
    },
    [currentMs, targetSeconds, quadrantLabel, t]
  );

  const stopOutsideApp = useCallback(() => {
    endBrushingActivity();
    void cancelBrushingTimerNotification();
  }, []);

  // Leaving the screen any way at all ends the activity and the pending ping.
  useEffect(() => stopOutsideApp, [stopOutsideApp]);

  const reset = useCallback(() => {
    stopOutsideApp();
    setRunning(false);
    setIsSaving(false);
    setElapsed(0);
    startedAtRef.current = null;
    bankedMsRef.current = 0;
    runStartMsRef.current = null;
    lastQuadrantRef.current = 0;
  }, [stopOutsideApp]);

  useEffect(() => {
    if (!running) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    const id = setInterval(() => {
      const seconds = Math.floor(currentMs() / 1000);
      setElapsed(seconds);
      const quadrant = brushingQuadrant(seconds, targetSeconds);
      if (quadrant !== lastQuadrantRef.current) {
        lastQuadrantRef.current = quadrant;
        if (quadrant === 4) {
          fireSuccessHaptic();
          playRestCompleteSound();
        } else {
          fireImpactHaptic();
          playIntervalCue('rest');
        }
        syncOutsideApp(true);
      }
    }, 250);
    return () => {
      clearInterval(id);
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [running, targetSeconds, currentMs, syncOutsideApp]);

  const toggle = () => {
    if (isSaving) return;
    if (running) {
      bankedMsRef.current = currentMs();
      runStartMsRef.current = null;
      setRunning(false);
      syncOutsideApp(false);
      return;
    }
    if (!startedAtRef.current) startedAtRef.current = new Date();
    runStartMsRef.current = Date.now();
    setRunning(true);
    fireImpactHaptic();
    syncOutsideApp(true);
  };

  const saveOnce = useSaveOncePerRun(elapsed > 0 || running);
  const handleDone = () => {
    const seconds = Math.round(currentMs() / 1000);
    const startedAt = startedAtRef.current;
    if (!startedAt || seconds <= 0) return Promise.resolve();
    bankedMsRef.current = currentMs();
    runStartMsRef.current = null;
    setRunning(false);
    stopOutsideApp();
    setIsSaving(true);
    return saveOnce(
      () => onSave(startedAt, seconds),
      () => {
        setIsSaving(false);
        reset();
        onClose();
      }
    ).finally(() => {
      setIsSaving(false);
    });
  };

  const handleClose = () => {
    if (isSaving) return;
    reset();
    onClose();
  };

  const quadrant = brushingQuadrant(elapsed, targetSeconds);
  const remaining = Math.max(0, targetSeconds - elapsed);
  const timeLeftFraction = targetSeconds > 0 ? remaining / targetSeconds : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <FullScreenModalBody className="justify-between px-6">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-text-primary text-xl font-bold">
              {t('oralCare.timer.title', { defaultValue: 'Brushing timer' })}
            </Text>
            <Text className="text-text-secondary text-xs mt-0.5">
              {t('oralCare.timer.subtitle', {
                defaultValue: '{{time}}, a quarter of your mouth at a time',
                time: formatOralCareClock(targetSeconds),
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

        <View className="items-center justify-center my-auto">
          <View
            className="items-center justify-center"
            style={{ width: RING_SIZE, height: RING_SIZE }}
          >
            {/* Full at the start, drains to empty as the time runs out. */}
            <View className="absolute" accessibilityElementsHidden>
              <ProgressRing
                progress={timeLeftFraction}
                size={RING_SIZE}
                strokeWidth={RING_STROKE}
                color={RING_COLOR}
                backgroundColor={RING_TRACK}
              />
            </View>
            <Text
              className="text-text-primary text-5xl font-mono font-bold"
              accessibilityLiveRegion="polite"
            >
              {quadrant === 4
                ? formatOralCareClock(elapsed)
                : formatOralCareClock(remaining)}
            </Text>
            <Text className="text-sky-600 dark:text-sky-300 text-sm mt-3 font-medium">
              {quadrant === 4
                ? t('oralCare.timer.done', { defaultValue: 'Done! Tap Save' })
                : elapsed === 0 && !running
                  ? t('oralCare.timer.ready', { defaultValue: 'Ready' })
                  : quadrantLabel(quadrant)}
            </Text>
          </View>
          <View className="flex-row gap-2 mt-6" accessibilityElementsHidden>
            {[0, 1, 2, 3].map((q) => (
              <View
                key={q}
                className={`h-2 w-10 rounded-full ${
                  q < quadrant || quadrant === 4
                    ? 'bg-sky-500'
                    : q === quadrant && (running || elapsed > 0)
                      ? 'bg-sky-500/50'
                      : 'bg-border-subtle'
                }`}
              />
            ))}
          </View>
        </View>

        <View className="flex-row gap-3 mt-4">
          <TouchableOpacity
            onPress={toggle}
            disabled={isSaving}
            className={`flex-1 py-4 rounded-2xl items-center ${
              isSaving
                ? 'bg-slate-400 opacity-60'
                : running
                  ? 'bg-amber-600'
                  : 'bg-sky-600'
            }`}
            accessibilityRole="button"
          >
            <Text className="text-white font-bold text-base">
              {running
                ? t('oralCare.timer.pause', { defaultValue: 'Pause' })
                : elapsed > 0
                  ? t('oralCare.timer.resume', { defaultValue: 'Resume' })
                  : t('oralCare.timer.start', { defaultValue: 'Start' })}
            </Text>
          </TouchableOpacity>
          {elapsed > 0 && (
            <TouchableOpacity
              onPress={handleDone}
              disabled={isSaving}
              className={`flex-1 bg-emerald-600 py-4 rounded-2xl items-center ${
                isSaving ? 'opacity-60' : ''
              }`}
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-base">
                {isSaving
                  ? t('common.saving', { defaultValue: 'Saving…' })
                  : t('oralCare.timer.save', { defaultValue: 'Save' })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </FullScreenModalBody>
    </Modal>
  );
};
