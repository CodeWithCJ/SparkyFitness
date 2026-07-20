import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
      Toast.show({ type: 'error', text1: 'Could not start session' });
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
      Toast.show({ type: 'success', text1: `Session saved · ${kickTimes.length} kicks` });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save session' });
    } finally {
      setSessionId(null);
      setStartedAt(null);
      setElapsed(0);
    }
  };

  const isActive = sessionId != null;
  const lastSession = sessions.find((s) => s.ended_at);

  return (
    <View className="bg-surface rounded-2xl p-5 border border-border-subtle shadow-sm gap-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-sm font-semibold">Kick Counter</Text>
        {isActive && <Text className="text-text-secondary text-xs">{formatElapsed(elapsed)}</Text>}
      </View>

      {isActive ? (
        <>
          <TouchableOpacity
            onPress={handleKick}
            className="items-center justify-center rounded-full bg-pink-500 aspect-square self-center w-40"
          >
            <Text className="text-white text-4xl font-bold">{kickTimes.length}</Text>
            <Text className="text-white text-xs mt-1">Tap for each kick</Text>
          </TouchableOpacity>
          <Button variant="outline" tone="neutral" onPress={handleEnd}>
            End Session
          </Button>
        </>
      ) : (
        <>
          <Text className="text-text-secondary text-xs">
            Time how long it takes to feel 10 movements. Tap once for each kick.
          </Text>
          {lastSession && (
            <Text className="text-text-secondary text-xs">
              Last session: {lastSession.kick_count} kicks
            </Text>
          )}
          <Button variant="primary" disabled={isStarting} onPress={handleStart}>
            {isStarting ? 'Starting…' : 'Start Counting'}
          </Button>
        </>
      )}
    </View>
  );
};

export default KickCounter;
