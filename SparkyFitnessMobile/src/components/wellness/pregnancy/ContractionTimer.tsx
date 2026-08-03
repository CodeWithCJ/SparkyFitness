import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  useContractionMutations,
  useContractionAnalysis,
} from '../../../hooks/usePregnancyTracking';
import Button from '../../ui/Button';

interface ContractionTimerProps {
  pregnancyId: string;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Live contraction timer. Start begins a contraction (records started_at);
 * Stop ends it (ended_at). Backend returns frequency/duration analysis and a
 * 5-1-1-style "go to hospital" flag.
 */
const ContractionTimer: React.FC<ContractionTimerProps> = ({ pregnancyId }) => {
  const { createContractionAsync, updateContractionAsync, isCreating } = useContractionMutations();
  const { analysis } = useContractionAnalysis();
  const { t } = useTranslation();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt != null) {
      intervalRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 500);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  const handleStart = async () => {
    try {
      const contraction = await createContractionAsync({
        pregnancyId,
        startedAt: new Date().toISOString(),
      });
      setActiveId(contraction.id ?? null);
      setStartedAt(Date.now());
      setElapsed(0);
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.pregnancyTools.startTimerError') });
    }
  };

  const handleStop = async () => {
    if (!activeId) return;
    try {
      await updateContractionAsync({
        id: activeId,
        body: { ended_at: new Date().toISOString() },
      });
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.pregnancyTools.saveContractionError') });
    } finally {
      setActiveId(null);
      setStartedAt(null);
      setElapsed(0);
    }
  };

  const isActive = activeId != null;

  return (
    <View className="bg-surface rounded-xl p-5 border-0 shadow-sm gap-4">
       <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.pregnancyTools.contractionTimer')}</Text>

      {isActive ? (
        <>
          <Text className="text-center text-3xl font-bold text-pink-500">
            {formatElapsed(elapsed)}
          </Text>
          <Button variant="primary" onPress={handleStop}>
             {t('mobileComponents.wellness.pregnancyTools.stop')}
          </Button>
        </>
      ) : (
        <Button variant="primary" disabled={isCreating} onPress={handleStart}>
           {isCreating ? t('mobileComponents.wellness.pregnancyTools.starting') : t('mobileComponents.wellness.pregnancyTools.startContraction')}
        </Button>
      )}

      {analysis && (analysis.frequencySeconds > 0 || analysis.durationSeconds > 0) && (
        <View className="flex-row justify-between rounded-xl bg-raised p-3">
          <View>
             <Text className="text-text-secondary text-xs">{t('mobileComponents.wellness.pregnancyTools.frequency')}</Text>
            <Text className="text-text-primary text-sm font-semibold">
               {t('mobileComponents.wellness.pregnancyTools.every', { value: formatDuration(analysis.frequencySeconds) })}
            </Text>
          </View>
          <View>
             <Text className="text-text-secondary text-xs">{t('mobileComponents.wellness.pregnancyTools.duration')}</Text>
            <Text className="text-text-primary text-sm font-semibold">
              {formatDuration(analysis.durationSeconds)}
            </Text>
          </View>
        </View>
      )}

      {analysis?.shouldGoToHospital && (
        <View className="rounded-xl bg-bg-danger-subtle p-3">
          <Text className="text-text-danger text-xs font-semibold">
             {t('mobileComponents.wellness.pregnancyTools.hospital')}
          </Text>
        </View>
      )}
    </View>
  );
};

export default ContractionTimer;
