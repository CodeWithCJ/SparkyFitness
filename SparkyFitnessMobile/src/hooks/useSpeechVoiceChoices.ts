import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { PickerOption } from '../components/BottomSheetPicker';
import { getAppLocale } from '../localization';
import { loadSpeechVoices } from '../services/speechVoice';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  hasBetterVoice,
  voicesForLocale,
  voiceTier,
  type SpeechVoice,
} from '../utils/speechVoices';

/** Picker value for "choose for me". */
export const AUTOMATIC_VOICE = '';

/**
 * The voice picker shared by guided workouts and GPS recordings: installed
 * voices for the app language, best first, plus an automatic choice that picks
 * the best premium or enhanced voice. One device-local choice serves both.
 */
export function useSpeechVoiceChoices(enabled = true) {
  const { t } = useTranslation();
  const voiceId = useAppPreferencesStore((s) => s.guidedVoiceId);
  const setVoiceId = useAppPreferencesStore((s) => s.setGuidedVoiceId);
  const [voices, setVoices] = useState<SpeechVoice[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Read again each time: a voice may have been downloaded since.
    void loadSpeechVoices(true).then((list) => {
      if (!cancelled) setVoices(list);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const locale = getAppLocale();

  const options = useMemo<PickerOption<string>[]>(() => {
    const tierLabel = (voice: SpeechVoice): string => {
      const tier = voiceTier(voice);
      if (tier === 3) {
        return t('speechVoice.premium', { defaultValue: 'Premium' });
      }
      if (tier === 2) {
        return t('speechVoice.enhanced', { defaultValue: 'Enhanced' });
      }
      return t('speechVoice.standard', { defaultValue: 'Standard' });
    };
    // Only voices the resolver will accept; none for the locale leaves just
    // the automatic choice.
    const shown = voicesForLocale(voices, locale);
    return [
      {
        label: t('speechVoice.automatic', {
          defaultValue: 'Automatic (best installed)',
        }),
        value: AUTOMATIC_VOICE,
      },
      ...shown.map((v) => ({
        label: `${v.name} · ${tierLabel(v)}`,
        value: v.identifier,
      })),
    ];
  }, [voices, locale, t]);

  // Say how to get a better voice only once we know none is installed.
  const hint =
    voices.length > 0 && !hasBetterVoice(voices, locale)
      ? Platform.OS === 'ios'
        ? t('speechVoice.hintIos', {
            defaultValue:
              'For a more natural voice, download a Premium or Enhanced one in Settings → Accessibility → Read & Speak → Voices, then come back here.',
          })
        : t('speechVoice.hintAndroid', {
            defaultValue:
              'For a more natural voice, install a higher-quality one in your phone’s text-to-speech settings, then come back here.',
          })
      : null;

  // A pick in another language is not offered, and is not used either.
  const value =
    voiceId && options.some((o) => o.value === voiceId)
      ? voiceId
      : AUTOMATIC_VOICE;

  return {
    options,
    value,
    onSelect: (value: string) =>
      setVoiceId(value === AUTOMATIC_VOICE ? null : value),
    hint,
  };
}
