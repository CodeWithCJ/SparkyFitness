import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAui, useAuiState } from '@assistant-ui/react-native';
import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { File } from 'expo-file-system';
import Toast from 'react-native-toast-message';
import Icon from '../Icon';
import { transcribeVoiceRecording } from '../../services/api/voiceTranscriptionApi';
import { addLog } from '../../services/LogService';
import {
  useVoiceInputLifecycle,
  type VoiceCancellationReason,
} from '../../hooks/useVoiceInputLifecycle';

const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

interface Props {
  serviceConfigId: string;
  textPrimary: string;
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

export default function AiVoiceDictationButton({
  serviceConfigId,
  textPrimary,
  recording,
  onRecordingChange,
  onBusyChange,
  onVolumeChange,
}: Props) {
  const { t } = useTranslation();
  const aui = useAui();
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 80);
  const [processing, setProcessing] = useState(false);
  const composerText = useAuiState((state) => state.composer.text);
  const composerTextRef = useRef(composerText);
  const baseTextRef = useRef('');
  const recordingRef = useRef(false);
  const fileRef = useRef<string | null>(null);
  const sessionRef = useRef(0);
  const operationRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    composerTextRef.current = composerText;
  }, [composerText]);

  useEffect(() => {
    if (recording && recorderState.metering !== undefined) {
      onVolumeChange(
        Math.max(0, Math.min(1, (recorderState.metering + 55) / 45))
      );
    }
  }, [onVolumeChange, recorderState.metering, recording]);

  const releaseRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        await recorder.stop();
        fileRef.current = recorder.uri ?? fileRef.current;
      }
    } catch {
      // expo-audio may already have released its native recorder on unmount.
    } finally {
      recordingRef.current = false;
      const uri = fileRef.current;
      fileRef.current = null;
      if (uri) {
        try {
          new File(uri).delete();
        } catch (error) {
          addLog('chat.voice.delete', 'WARNING', [String(error)]);
        }
      }
      await setAudioModeAsync({ allowsRecording: false }).catch(
        (error: unknown) => {
          addLog('chat.voice.audioMode', 'WARNING', [String(error)]);
        }
      );
    }
  }, [recorder]);

  const cancel = useCallback(
    (reason: VoiceCancellationReason) => {
      const session = ++sessionRef.current;
      abortRef.current?.abort();
      // Serialize cleanup after pending permission/prepare/stop operations. A late
      // permission grant cannot resurrect recording after navigation/backgrounding.
      const cleanup = Promise.resolve(operationRef.current).then(
        releaseRecording
      );
      operationRef.current = cleanup;
      if (reason !== 'unmount') {
        onRecordingChange(false);
        onVolumeChange(0);
      }
      void cleanup.finally(() => {
        if (operationRef.current === cleanup) operationRef.current = null;
        if (sessionRef.current === session && reason !== 'unmount') {
          setProcessing(false);
          onBusyChange(false);
        }
      });
    },
    [onBusyChange, onRecordingChange, onVolumeChange, releaseRecording]
  );
  useVoiceInputLifecycle(cancel);

  const toggleDictation = useCallback(() => {
    if (operationRef.current) return;
    const session = ++sessionRef.current;
    const stopping = recordingRef.current;
    setProcessing(true);
    onBusyChange(true);
    const task = (async () => {
      let keepRecording = false;
      try {
        if (stopping) {
          await recorder.stop();
          recordingRef.current = false;
          fileRef.current = recorder.uri;
          if (sessionRef.current !== session) return;
          onRecordingChange(false);
          onVolumeChange(0);
          const uri = fileRef.current;
          if (!uri) throw new Error('Audio recorder did not return a file.');
          const controller = new AbortController();
          abortRef.current = controller;
          const result = await transcribeVoiceRecording({
            uri,
            serviceConfigId,
            signal: controller.signal,
          });
          if (sessionRef.current === session) {
            aui
              .composer()
              .setText(
                [baseTextRef.current, result.text.trim()]
                  .filter(Boolean)
                  .join(' ')
              );
          }
        } else {
          // On Android, even re-requesting a granted permission briefly
          // backgrounds the activity. Avoid cancelling our own start request.
          const currentPermission = await getRecordingPermissionsAsync();
          if (sessionRef.current !== session) return;
          const permission = currentPermission.granted
            ? currentPermission
            : await requestRecordingPermissionsAsync();
          if (sessionRef.current !== session) return;
          if (!permission.granted) {
            Alert.alert(
              t('chat.voice.permissionTitle', {
                defaultValue: 'Voice input needs the microphone',
              }),
              t('chat.voice.permissionMessage', {
                defaultValue:
                  'Allow microphone and speech recognition in system settings to dictate messages.',
              })
            );
            return;
          }
          baseTextRef.current = composerTextRef.current.trim();
          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });
          if (sessionRef.current !== session) return;
          await recorder.prepareToRecordAsync();
          fileRef.current = recorder.uri;
          if (sessionRef.current !== session) return;
          recorder.record();
          recordingRef.current = true;
          fileRef.current = recorder.uri;
          keepRecording = true;
          onVolumeChange(0);
          onRecordingChange(true);
        }
      } catch (error) {
        if (sessionRef.current === session) {
          addLog('chat.voice.ai', 'ERROR', [
            error instanceof Error ? error.message : String(error),
          ]);
          Toast.show({
            type: 'error',
            text1: t('chat.voice.aiErrorTitle', {
              defaultValue: 'AI voice transcription failed',
            }),
            text2: t('chat.voice.aiErrorMessage', {
              defaultValue: 'Check the selected Voice provider and try again.',
            }),
          });
          onRecordingChange(false);
          onVolumeChange(0);
        }
      } finally {
        if (!keepRecording || sessionRef.current !== session)
          await releaseRecording();
        if (sessionRef.current === session) {
          abortRef.current = null;
          setProcessing(false);
          onBusyChange(false);
        }
      }
    })();
    operationRef.current = task;
    void task.finally(() => {
      if (operationRef.current === task) operationRef.current = null;
    });
  }, [
    aui,
    onBusyChange,
    onRecordingChange,
    onVolumeChange,
    recorder,
    releaseRecording,
    serviceConfigId,
    t,
  ]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        recording
          ? t('chat.voice.stop', { defaultValue: 'Stop dictation' })
          : t('chat.voice.aiLabel', { defaultValue: 'Dictate with AI' })
      }
      accessibilityState={{ disabled: processing, selected: recording }}
      disabled={processing}
      onPress={toggleDictation}
      className={
        recording || processing
          ? 'bg-border-subtle rounded-full w-10 h-10 items-center justify-center'
          : 'rounded-full w-10 h-10 items-center justify-center'
      }
    >
      {processing ? (
        <ActivityIndicator size="small" color={textPrimary} />
      ) : (
        <Icon
          name={recording ? 'stop' : 'microphone'}
          size={recording ? 17 : 20}
          color={textPrimary}
        />
      )}
    </Pressable>
  );
}
