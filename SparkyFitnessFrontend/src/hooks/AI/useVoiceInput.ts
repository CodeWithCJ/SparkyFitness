import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BrowserVoiceInput,
  type VoiceError,
  type VoicePhase,
} from '@/utils/browserVoiceInput';
import { transcribeVoiceRecording } from '@/api/Chatbot/voiceTranscription';

interface Options {
  enabled: boolean;
  serviceId: string | null;
  language: string;
  getText: () => string;
  setText: (text: string) => void;
  onLevel: (level: number) => void;
}

export function useVoiceInput(options: Options) {
  const latest = useRef(options);
  const draft = useRef('');
  const engine = useRef<BrowserVoiceInput | null>(null);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<VoiceError | null>(null);
  useEffect(() => {
    latest.current = options;
  }, [options]);

  useEffect(() => {
    let mounted = true;
    const session = new BrowserVoiceInput({
      onPhase: (value) => {
        if (mounted) setPhase(value);
      },
      onError: (value) => {
        if (mounted) setError(value);
      },
      onLevel: (level) => latest.current.onLevel(level),
      onTranscript: (text) => {
        // A suggestion, a new thread, or another composer action may have
        // replaced the draft despite the disabled input. Never overwrite it.
        if (mounted && latest.current.getText() === draft.current) {
          latest.current.setText(
            [draft.current.trim(), text.trim()].filter(Boolean).join(' ')
          );
        }
      },
      transcribe: transcribeVoiceRecording,
    });
    engine.current = session;
    const visibility = () => {
      if (document.visibilityState === 'hidden') session.cancel();
    };
    const cancel = () => session.cancel();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') session.cancel();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      mounted = false;
      session.cancel();
      engine.current = null;
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  // Changing providers, disabling voice, or starting a chat response cancels
  // pending permissions, recognition, recording, and uploads alike.
  useEffect(
    () => () => engine.current?.cancel(),
    [options.enabled, options.serviceId]
  );

  const start = useCallback(() => {
    if (!latest.current.enabled) return;
    draft.current = latest.current.getText();
    setError(null);
    void engine.current?.start(
      latest.current.serviceId,
      latest.current.language
    );
  }, []);
  const stop = useCallback(() => engine.current?.stop(), []);
  const cancel = useCallback(() => engine.current?.cancel(), []);
  return { phase, error, start, stop, cancel, busy: phase !== 'idle' };
}
