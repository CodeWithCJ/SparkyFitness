import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
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
      Toast.show({ type: 'error', text1: 'Could not start timer' });
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
      Toast.show({ type: 'error', text1: 'Could not save contraction' });
    } finally {
      setActiveId(null);
      setStartedAt(null);
      setElapsed(0);
    }
  };

  const isActive = activeId != null;

  return (
    <View className="bg-surface rounded-2xl p-5 border border-border-subtle shadow-sm gap-4">
      <Text className="text-text-primary text-sm font-semibold">Contraction Timer</Text>

      {isActive ? (
        <>
          <Text className="text-center text-3xl font-bold text-pink-500">
            {formatElapsed(elapsed)}
          </Text>
          <Button variant="primary" onPress={handleStop}>
            Stop
          </Button>
        </>
      ) : (
        <Button variant="primary" disabled={isCreating} onPress={handleStart}>
          {isCreating ? 'Starting…' : 'Start Contraction'}
        </Button>
      )}

      {analysis && (analysis.frequencySeconds > 0 || analysis.durationSeconds > 0) && (
        <View className="flex-row justify-between rounded-xl bg-raised p-3">
          <View>
            <Text className="text-text-secondary text-xs">Frequency</Text>
            <Text className="text-text-primary text-sm font-semibold">
              every {formatDuration(analysis.frequencySeconds)}
            </Text>
          </View>
          <View>
            <Text className="text-text-secondary text-xs">Duration</Text>
            <Text className="text-text-primary text-sm font-semibold">
              {formatDuration(analysis.durationSeconds)}
            </Text>
          </View>
        </View>
      )}

      {analysis?.shouldGoToHospital && (
        <View className="rounded-xl bg-bg-danger-subtle p-3">
          <Text className="text-text-danger text-xs font-semibold">
            Your contractions match the 5-1-1 pattern — consider contacting your provider.
          </Text>
        </View>
      )}
    </View>
  );
};

export default ContractionTimer;
