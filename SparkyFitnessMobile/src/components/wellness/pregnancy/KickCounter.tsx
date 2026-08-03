import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useKickMutations, useKickSessions } from '../../../hooks/usePregnancyTracking';
import Button from '../../ui/Button';

interface KickCounterProps {
  pregnancyId: string;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Live fetal kick-count session. Starts a session, records each tap as a
 * timestamp, and ends the session — persisted to pregnancy_kick_sessions.
 */
const KickCounter: React.FC<KickCounterProps> = ({ pregnancyId }) => {
  const { startKickAsync, updateKickAsync, isStarting } = useKickMutations();
  const { sessions } = useKickSessions();
  const { t } = useTranslation();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [kickTimes, setKickTimes] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (startedAt != null) {
      intervalRef.current = setInterval(() => setElapsed(Date.now() - startedAt), 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  const handleStart = async () => {
    try {
      const session = await startKickAsync(pregnancyId);
      setSessionId(session.id ?? null);
      setStartedAt(Date.now());
      setKickTimes([]);
      setElapsed(0);
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.pregnancyTools.startError') });
    }
  };

  const handleKick = async () => {
    if (!sessionId) return;
    const next = [...kickTimes, new Date().toISOString()];
    setKickTimes(next);
    try {
      await updateKickAsync({ id: sessionId, body: { kick_count: next.length, kick_times: next } });
    } catch {
      // keep local count; a failed write will reconcile on the next update
    }
  };

  const handleEnd = async () => {
    if (!sessionId) return;
    try {
      await updateKickAsync({
        id: sessionId,
        body: { kick_count: kickTimes.length, kick_times: kickTimes, ended: true },
      });
       Toast.show({ type: 'success', text1: t('mobileComponents.wellness.pregnancyTools.saved', { count: kickTimes.length }) });
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.pregnancyTools.saveError') });
    } finally {
      setSessionId(null);
      setStartedAt(null);
      setElapsed(0);
    }
  };

  const isActive = sessionId != null;
  const lastSession = sessions.find((s) => s.ended_at);

  return (
    <View className="bg-surface rounded-xl p-5 border-0 shadow-sm gap-4">
      <View className="flex-row items-center justify-between">
         <Text className="text-text-primary text-sm font-semibold">{t('mobileComponents.wellness.pregnancyTools.kickCounter')}</Text>
        {isActive && <Text className="text-text-secondary text-xs">{formatElapsed(elapsed)}</Text>}
      </View>

      {isActive ? (
        <>
          <TouchableOpacity
            onPress={handleKick}
            className="items-center justify-center rounded-full bg-pink-500 aspect-square self-center w-40"
          >
            <Text className="text-white text-4xl font-bold">{kickTimes.length}</Text>
             <Text className="text-white text-xs mt-1">{t('mobileComponents.wellness.pregnancyTools.tapKick')}</Text>
          </TouchableOpacity>
          <Button variant="outline" tone="neutral" onPress={handleEnd}>
             {t('mobileComponents.wellness.pregnancyTools.endSession')}
          </Button>
        </>
      ) : (
        <>
          <Text className="text-text-secondary text-xs">
             {t('mobileComponents.wellness.pregnancyTools.timingHelp')}
          </Text>
          {lastSession && (
            <Text className="text-text-secondary text-xs">
               {t('mobileComponents.wellness.pregnancyTools.lastSession', { count: lastSession.kick_count })}
            </Text>
          )}
          <Button variant="primary" disabled={isStarting} onPress={handleStart}>
             {isStarting ? t('mobileComponents.wellness.pregnancyTools.starting') : t('mobileComponents.wellness.pregnancyTools.startCounting')}
          </Button>
        </>
      )}
    </View>
  );
};

export default KickCounter;
