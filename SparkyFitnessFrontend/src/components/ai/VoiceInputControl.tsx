import { useState, type Ref, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mic, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { VoiceInputSettings } from './VoiceInputSettings';
import {
  useAIServices,
  useActiveAIService,
  useUserAIPreferences,
  useUpdateUserAIPreferences,
} from '@/hooks/AI/useAIServiceSettings';
import type { VoiceError, VoicePhase } from '@/utils/browserVoiceInput';

interface Props {
  phase: VoicePhase;
  error: VoiceError | null;
  start: () => void;
  stop: () => void;
  cancel: () => void;
  waveformRef: Ref<HTMLDivElement>;
  children?: ReactNode;
}

export function VoiceInputControl({
  phase,
  error,
  start,
  stop,
  cancel,
  waveformRef,
  children,
}: Props) {
  const { t } = useTranslation();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const recording = phase === 'recording';
  const busy = phase !== 'idle';
  const errors: Record<VoiceError, string> = {
    unsupported: t(
      'chat.voice.unsupported',
      'This voice mode is not supported in this browser. Choose AI transcription in Voice settings or try another browser. AI is never enabled automatically.'
    ),
    permission: t(
      'chat.voice.permission',
      'Allow microphone access in your browser settings to dictate a message.'
    ),
    tooLarge: t(
      'chat.voice.tooLarge',
      'The recording exceeded 10 MB. Try a shorter message.'
    ),
    noSpeech: t(
      'chat.voice.noSpeech',
      'No speech was recognized. Your draft has not changed.'
    ),
    failed: t(
      'chat.voice.failed',
      'Voice input failed. Your draft has not changed. Check your connection and Voice settings, then try again.'
    ),
  };
  return (
    <>
      <div className="flex items-center gap-2">
        {busy && (
          <div className="flex items-center gap-2" role="status">
            {recording ? (
              <div
                ref={waveformRef}
                className="flex h-8 items-center gap-0.5"
                aria-hidden="true"
              >
                {Array.from({ length: 17 }, (_, index) => (
                  <span
                    key={index}
                    className="w-0.5 rounded-full bg-primary transition-[height] duration-100 motion-reduce:[--voice-level:0] motion-reduce:transition-none"
                    style={{
                      height: `calc(4px + var(--voice-level, 0) * ${28 * (1 - Math.abs(index - 8) / 10)}px)`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            <span className="text-xs text-muted-foreground">
              {recording
                ? t('chat.voice.listening', 'Listening…')
                : phase === 'starting'
                  ? t('chat.voice.starting', 'Starting…')
                  : t('chat.voice.processing', 'Transcribing…')}
            </span>
          </div>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy && !recording}
          aria-label={
            recording
              ? t('chat.voice.stop', 'Stop dictation')
              : t('chat.voice.start', 'Dictate message')
          }
          onClick={recording ? stop : start}
        >
          {recording ? (
            <Square className="size-4 fill-current" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>
        {busy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={cancel}
            aria-label={t('chat.voice.cancel', 'Cancel dictation')}
          >
            <X className="size-4" />
          </Button>
        )}
        {children}
      </div>
      {error && (
        <div className="basis-full text-sm text-destructive" role="alert">
          {errors[error]}
          <Button
            type="button"
            variant="link"
            onClick={() => setSettingsOpen(true)}
          >
            {t('voiceSettings.open', 'Voice settings')}
          </Button>
        </div>
      )}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('voiceSettings.open', 'Voice settings')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'voiceSettings.manualSend',
                'Dictation fills your draft. Review or edit it, then send it yourself.'
              )}
            </DialogDescription>
          </DialogHeader>
          {settingsOpen && <VoiceSettingsContent />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function VoiceSettingsContent() {
  const { data: preferences } = useUserAIPreferences();
  const { data: services = [] } = useAIServices();
  const { data: chatService } = useActiveAIService(true);
  const { mutate, isPending } = useUpdateUserAIPreferences();
  return (
    <VoiceInputSettings
      preferences={preferences}
      services={services}
      chatServiceId={chatService?.id}
      onChange={(patch, onSaved) => mutate(patch, { onSuccess: onSaved })}
      disabled={isPending}
    />
  );
}
