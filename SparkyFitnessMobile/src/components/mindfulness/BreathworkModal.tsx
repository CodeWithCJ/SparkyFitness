import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import FullScreenModalBody from '../FullScreenModalBody';
import Icon from '../Icon';
import { useSaveOncePerRun } from '../../hooks/useSaveOncePerRun';

type ProtocolKey = 'box' | 'relax' | 'coherence';

interface ProtocolConfig {
  name: string;
  descriptionKey: string;
  defaultDescription: string;
  inhale: number;
  holdIn: number;
  exhale: number;
  holdOut: number;
}

const PROTOCOLS: Record<ProtocolKey, ProtocolConfig> = {
  box: {
    name: 'Box Breathing',
    descriptionKey: 'mindfulness.breathwork.boxDescription',
    defaultDescription: '4-4-4-4 • Focus & Calm',
    inhale: 4,
    holdIn: 4,
    exhale: 4,
    holdOut: 4,
  },
  relax: {
    name: '4-7-8 Relax',
    descriptionKey: 'mindfulness.breathwork.relaxDescription',
    defaultDescription: 'Deep calm & sleep prep',
    inhale: 4,
    holdIn: 7,
    exhale: 8,
    holdOut: 0,
  },
  coherence: {
    name: 'Coherence',
    descriptionKey: 'mindfulness.breathwork.coherenceDescription',
    defaultDescription: '5-5 • Balance & HR drop',
    inhale: 5,
    holdIn: 0,
    exhale: 5,
    holdOut: 0,
  },
};

type BreathPhase = 'inhale' | 'holdIn' | 'exhale' | 'holdOut';

interface BreathworkModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (
    durationSeconds: number,
    sessionType: string
  ) => void | Promise<unknown>;
}

export const BreathworkModal: React.FC<BreathworkModalProps> = ({
  visible,
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [textPrimary] = useCSSVariable(['--color-text-primary']) as [string];
  const [protocolKey, setProtocolKey] = useState<ProtocolKey>('box');
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<BreathPhase>('inhale');
  const [phaseCountdown, setPhaseCountdown] = useState(4);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.7);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const protocol = PROTOCOLS[protocolKey];

  const triggerHaptic = useCallback((style: Haptics.ImpactFeedbackStyle) => {
    try {
      Haptics.impactAsync(style);
    } catch {
      // Haptics not supported on device
    }
  }, []);

  const resetState = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    setIsActive(false);
    setPhase('inhale');
    setPhaseCountdown(protocol.inhale);
    setElapsedSeconds(0);
    setCyclesCompleted(0);
  }, [protocol.inhale]);

  // Declarative animation driven by breathing phase
  useEffect(() => {
    if (!isActive) {
      scale.value = withTiming(1, { duration: 300 });
      opacity.value = withTiming(0.7, { duration: 300 });
      return;
    }

    if (phase === 'inhale') {
      scale.value = withTiming(1.6, {
        duration: protocol.inhale * 1000,
        easing: Easing.inOut(Easing.ease),
      });
      opacity.value = withTiming(1, { duration: protocol.inhale * 1000 });
      triggerHaptic(Haptics.ImpactFeedbackStyle.Heavy);
    } else if (phase === 'exhale') {
      scale.value = withTiming(1, {
        duration: protocol.exhale * 1000,
        easing: Easing.inOut(Easing.ease),
      });
      opacity.value = withTiming(0.6, { duration: protocol.exhale * 1000 });
      triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      triggerHaptic(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [phase, isActive, protocol, triggerHaptic, scale, opacity]);

  useEffect(() => {
    if (!isActive) return;

    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, [isActive]);

  const advancePhase = useCallback(() => {
    if (phase === 'inhale') {
      if (protocol.holdIn > 0) {
        setPhase('holdIn');
        setPhaseCountdown(protocol.holdIn);
      } else {
        setPhase('exhale');
        setPhaseCountdown(protocol.exhale);
      }
    } else if (phase === 'holdIn') {
      setPhase('exhale');
      setPhaseCountdown(protocol.exhale);
    } else if (phase === 'exhale') {
      if (protocol.holdOut > 0) {
        setPhase('holdOut');
        setPhaseCountdown(protocol.holdOut);
      } else {
        setCyclesCompleted((prev) => prev + 1);
        setPhase('inhale');
        setPhaseCountdown(protocol.inhale);
      }
    } else if (phase === 'holdOut') {
      setCyclesCompleted((prev) => prev + 1);
      setPhase('inhale');
      setPhaseCountdown(protocol.inhale);
    }
  }, [phase, protocol]);

  useEffect(() => {
    if (!isActive) return;

    timerRef.current = setInterval(() => {
      setPhaseCountdown((prev) => {
        if (prev <= 1) {
          advancePhase();
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, advancePhase]);

  const startSession = () => {
    setIsActive(true);
    setPhase('inhale');
    setPhaseCountdown(protocol.inhale);
  };

  const pauseSession = () => {
    setIsActive(false);
  };

  const canFinish = elapsedSeconds > 0;
  // Finish stays on screen while the save runs: one run is logged once.
  const saveRunOnce = useSaveOncePerRun(canFinish);
  const handleFinish = () =>
    saveRunOnce(
      () => onSave(elapsedSeconds, 'breathwork'),
      () => {
        resetState();
        onClose();
      }
    );

  const handleClose = () => {
    resetState();
    onClose();
  };

  const circleAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const getPhaseText = () => {
    switch (phase) {
      case 'inhale':
        return t('mindfulness.breathwork.inhale', { defaultValue: 'Inhale' });
      case 'holdIn':
      case 'holdOut':
        return t('mindfulness.breathwork.hold', { defaultValue: 'Hold' });
      case 'exhale':
        return t('mindfulness.breathwork.exhale', { defaultValue: 'Exhale' });
    }
  };

  const formatMinutesSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getProtocolDescription = (key: ProtocolKey) => {
    switch (key) {
      case 'box':
        return t('mindfulness.breathwork.boxDescription', {
          defaultValue: '4-4-4-4 • Focus & Calm',
        });
      case 'relax':
        return t('mindfulness.breathwork.relaxDescription', {
          defaultValue: 'Deep calm & sleep prep',
        });
      case 'coherence':
        return t('mindfulness.breathwork.coherenceDescription', {
          defaultValue: '5-5 • Balance & HR drop',
        });
    }
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
              {t('mindfulness.breathwork.title', {
                defaultValue: 'Breathwork',
              })}
            </Text>
            <Text className="text-text-secondary text-xs mt-0.5">
              {protocol.name} • {getProtocolDescription(protocolKey)}
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

        {/* Protocol Selector (only when not active) */}
        {!isActive && elapsedSeconds === 0 && (
          <View className="flex-row justify-center gap-2 my-2">
            {(Object.keys(PROTOCOLS) as ProtocolKey[]).map((key) => {
              const isSelected = key === protocolKey;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setProtocolKey(key)}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-blue-500/20 border-blue-500'
                      : 'bg-surface border-border-subtle'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-text-secondary'
                    }`}
                  >
                    {PROTOCOLS[key].name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Central Animated Breathing Bubble */}
        <View className="items-center justify-center my-auto">
          <Animated.View style={[styles.breathingCircle, circleAnimatedStyle]}>
            <View style={styles.breathingInnerCircle} />
          </Animated.View>

          <View className="absolute items-center">
            <Text className="text-text-primary text-3xl font-extrabold tracking-wider">
              {isActive
                ? getPhaseText()
                : t('mindfulness.breathwork.ready', {
                    defaultValue: 'Ready',
                  })}
            </Text>
            {isActive && (
              <Text className="text-blue-600 dark:text-blue-400 text-4xl font-bold mt-2">
                {phaseCountdown}
              </Text>
            )}
          </View>
        </View>

        {/* Stats Bar */}
        <View className="flex-row justify-around py-3 bg-surface rounded-2xl border border-border-subtle">
          <View className="items-center">
            <Text className="text-text-secondary text-xs">
              {t('mindfulness.breathwork.time', { defaultValue: 'Time' })}
            </Text>
            <Text className="text-text-primary text-base font-semibold mt-0.5">
              {formatMinutesSeconds(elapsedSeconds)}
            </Text>
          </View>
          <View className="items-center">
            <Text className="text-text-secondary text-xs">
              {t('mindfulness.breathwork.cycles', { defaultValue: 'Cycles' })}
            </Text>
            <Text className="text-text-primary text-base font-semibold mt-0.5">
              {cyclesCompleted}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View className="flex-row gap-3 mt-4">
          {!isActive ? (
            <TouchableOpacity
              onPress={startSession}
              className="flex-1 bg-blue-600 py-4 rounded-2xl items-center"
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-base">
                {elapsedSeconds > 0
                  ? t('mindfulness.breathwork.resume', {
                      defaultValue: 'Resume',
                    })
                  : t('mindfulness.breathwork.start', {
                      defaultValue: 'Start Breathing',
                    })}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={pauseSession}
              className="flex-1 bg-amber-600 py-4 rounded-2xl items-center"
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-base">
                {t('mindfulness.breathwork.pause', { defaultValue: 'Pause' })}
              </Text>
            </TouchableOpacity>
          )}

          {canFinish && (
            <TouchableOpacity
              onPress={handleFinish}
              className="flex-1 bg-emerald-600 py-4 rounded-2xl items-center"
              accessibilityRole="button"
            >
              <Text className="text-white font-bold text-base">
                {t('mindfulness.breathwork.finishAndSave', {
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

const styles = StyleSheet.create({
  breathingCircle: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
    borderWidth: 2,
    borderColor: 'rgba(96, 165, 250, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
  },
  breathingInnerCircle: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
});
