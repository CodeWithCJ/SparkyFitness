/**
 * Choosing among the text-to-speech voices a phone has installed. Pure, so the
 * ranking can be tested without a device.
 *
 * `expo-speech` reports iOS Premium voices as "Default" (it only maps
 * `.enhanced`), so the tier is read from the identifier as well. Apple's
 * identifiers look like `com.apple.voice.premium.en-US.Ava`; if that ever
 * changes the ranking just falls back to what the library says.
 */

export interface SpeechVoice {
  identifier: string;
  name: string;
  language: string;
  /** What `expo-speech` reports: "Default" or "Enhanced". */
  quality?: string;
}

/** 3 premium, 2 enhanced, 1 ordinary, 0 a novelty voice that is never chosen. */
export type VoiceTier = 0 | 1 | 2 | 3;

const NOVELTY_VOICES = new Set(
  [
    'Albert',
    'BadNews',
    'Bahh',
    'Bells',
    'Boing',
    'Bubbles',
    'Cellos',
    'Deranged',
    'Fred',
    'GoodNews',
    'Hysterical',
    'Junior',
    'Kathy',
    'Organ',
    'Princess',
    'Ralph',
    'Trinoids',
    'Whisper',
    'Zarvox',
  ].map((name) => name.toLowerCase())
);

export function voiceTier(voice: SpeechVoice): VoiceTier {
  const id = voice.identifier.toLowerCase();
  const name = voice.name.toLowerCase();
  // iOS novelty voices (Bubbles, Zarvox, ...) are not for reading splits.
  // Matched by name: the same identifier prefix also covers real voices.
  if (NOVELTY_VOICES.has(id.slice(id.lastIndexOf('.') + 1))) return 0;
  if (id.includes('.premium.') || name.includes('(premium)')) return 3;
  if (
    id.includes('.enhanced.') ||
    name.includes('(enhanced)') ||
    voice.quality === 'Enhanced'
  ) {
    return 2;
  }
  return 1;
}

export function primaryLanguage(language: string): string {
  return language.split(/[-_]/)[0]?.toLowerCase() ?? '';
}

function sameRegion(voice: SpeechVoice, locale: string): boolean {
  return (
    voice.language.replace('_', '-').toLowerCase() ===
    locale.replace('_', '-').toLowerCase()
  );
}

/** Installed voices for the language, best first, novelty voices left out. */
export function voicesForLocale(
  voices: readonly SpeechVoice[],
  locale: string
): SpeechVoice[] {
  const language = primaryLanguage(locale);
  const matching = voices.filter(
    (v) => voiceTier(v) > 0 && primaryLanguage(v.language) === language
  );
  return matching.sort(
    (a, b) =>
      voiceTier(b) - voiceTier(a) ||
      Number(sameRegion(b, locale)) - Number(sameRegion(a, locale)) ||
      a.name.localeCompare(b.name)
  );
}

/**
 * The voice to use when the person has not picked one: the best premium or
 * enhanced voice for the language, or null to let the system choose. An
 * ordinary voice is not worth forcing, since the system default is the same.
 */
export function bestVoiceId(
  voices: readonly SpeechVoice[],
  locale: string
): string | null {
  const best = voicesForLocale(voices, locale)[0];
  return best && voiceTier(best) >= 2 ? best.identifier : null;
}

/** Whether a premium or enhanced voice is installed for the language. */
export function hasBetterVoice(
  voices: readonly SpeechVoice[],
  locale: string
): boolean {
  return bestVoiceId(voices, locale) !== null;
}
