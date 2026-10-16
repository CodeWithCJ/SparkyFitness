import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getVoiceServiceOptions,
  type VoiceInputPreferences,
  type VoiceServiceOption,
} from '@workspace/shared';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Props {
  preferences: VoiceInputPreferences | null | undefined;
  services: readonly VoiceServiceOption[];
  chatServiceId?: string | null;
  onChange: (patch: VoiceInputPreferences, onSaved?: () => void) => void;
  disabled?: boolean;
}

export function VoiceInputSettings({
  preferences,
  services,
  chatServiceId,
  onChange,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const [choosingAi, setChoosingAi] = useState(false);
  const enabled = preferences?.voice_input_enabled !== false;
  const aiMode = choosingAi || !!preferences?.active_voice_ai_service_id;
  const options = getVoiceServiceOptions(services, chatServiceId);
  const locked = disabled || !preferences;

  return (
    <section
      className="space-y-3 rounded-lg border p-4"
      aria-label={t('voiceSettings.title', 'Voice input')}
    >
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="voice-input-enabled">
          {t('voiceSettings.title', 'Voice input')}
        </Label>
        <Switch
          id="voice-input-enabled"
          checked={enabled}
          disabled={locked}
          onCheckedChange={(value) => {
            setChoosingAi(false);
            onChange({ voice_input_enabled: value });
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t(
          'voiceSettings.syncHint',
          'These settings apply to web and mobile. Turning voice input off hides the microphone without changing your model selection.'
        )}
      </p>
      {enabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="voice-recognition-mode">
              {t('voiceSettings.recognition', 'Recognition')}
            </Label>
            <Select
              value={aiMode ? 'ai' : 'system'}
              disabled={locked}
              onValueChange={(value) => {
                setChoosingAi(value === 'ai');
                if (value === 'system')
                  onChange({ active_voice_ai_service_id: null });
              }}
            >
              <SelectTrigger id="voice-recognition-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">
                  {t('voiceSettings.system', 'System (default)')}
                </SelectItem>
                <SelectItem value="ai">
                  {t('voiceSettings.ai', 'AI transcription')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {aiMode
              ? t(
                  'voiceSettings.aiHint',
                  'Audio is sent to the selected AI provider through your server. Provider charges may apply. Choose a model to enable AI transcription.'
                )
              : t(
                  'voiceSettings.systemHint',
                  'Uses your device or browser speech recognizer without a Sparky AI transcription charge. Availability and online processing depend on your device or browser.'
                )}
          </p>
          {aiMode && (
            <div className="space-y-2">
              <Label htmlFor="active-voice-ai-provider-select">
                {t('voiceSettings.model', 'Voice model')}
              </Label>
              <Select
                disabled={locked || options.length === 0}
                value={preferences?.active_voice_ai_service_id ?? ''}
                onValueChange={(id) => {
                  onChange({ active_voice_ai_service_id: id }, () =>
                    setChoosingAi(false)
                  );
                }}
              >
                <SelectTrigger id="active-voice-ai-provider-select">
                  <SelectValue
                    placeholder={t(
                      'voiceSettings.chooseModel',
                      'Choose a model'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {options.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.service_name}
                      {service.model_name ? ` — ${service.model_name}` : ''}
                      {service.id === chatServiceId
                        ? ` (${t('voiceSettings.chatModel', 'Used for chat')})`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {options.length === 0 && (
                <p role="status" className="text-sm text-muted-foreground">
                  {t(
                    'voiceSettings.noModels',
                    'No compatible voice models are enabled. Configure an audio-capable model in AI Service Settings in the web app, then refresh.'
                  )}
                </p>
              )}
              {!!preferences?.active_voice_ai_service_id &&
                !options.some(
                  (option) =>
                    option.id === preferences.active_voice_ai_service_id
                ) &&
                options.length > 0 && (
                  <p role="status" className="text-sm text-muted-foreground">
                    {t(
                      'voiceSettings.unavailable',
                      'The selected voice model is unavailable. Choose another model or switch to System.'
                    )}
                  </p>
                )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
