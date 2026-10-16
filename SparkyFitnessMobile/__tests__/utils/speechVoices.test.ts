import {
  bestVoiceId,
  hasBetterVoice,
  voicesForLocale,
  voiceTier,
  type SpeechVoice,
} from '../../src/utils/speechVoices';

const voice = (
  identifier: string,
  name: string,
  language: string,
  quality = 'Default'
): SpeechVoice => ({ identifier, name, language, quality });

const compact = voice(
  'com.apple.voice.compact.en-US.Samantha',
  'Samantha',
  'en-US'
);
const enhanced = voice(
  'com.apple.voice.enhanced.en-US.Zoe',
  'Zoe (Enhanced)',
  'en-US',
  'Enhanced'
);
// expo-speech reports an iOS premium voice as "Default".
const premium = voice(
  'com.apple.voice.premium.en-US.Ava',
  'Ava (Premium)',
  'en-US'
);
const novelty = voice(
  'com.apple.speech.synthesis.voice.Zarvox',
  'Zarvox',
  'en-US'
);
const british = voice(
  'com.apple.voice.premium.en-GB.Serena',
  'Serena (Premium)',
  'en-GB'
);
const french = voice('com.apple.voice.premium.fr-FR.Amelie', 'Amelie', 'fr-FR');

describe('voiceTier', () => {
  it('reads premium from the identifier since the library reports it as default', () => {
    expect(voiceTier(premium)).toBe(3);
    expect(voiceTier(enhanced)).toBe(2);
    expect(voiceTier(compact)).toBe(1);
  });

  it('treats an Android voice the library calls enhanced as enhanced', () => {
    expect(
      voiceTier(
        voice('en-us-x-tpd-network', 'en-us-x-tpd', 'en-US', 'Enhanced')
      )
    ).toBe(2);
  });

  it('does not mistake a real voice with the same identifier prefix for a novelty one', () => {
    expect(
      voiceTier(voice('com.apple.speech.synthesis.voice.Alex', 'Alex', 'en-US'))
    ).toBe(1);
  });

  it('never rates a novelty voice', () => {
    expect(voiceTier(novelty)).toBe(0);
  });
});

describe('voicesForLocale', () => {
  const all = [compact, novelty, french, enhanced, british, premium];

  it('keeps the language, drops novelty voices and puts the best first', () => {
    expect(voicesForLocale(all, 'en-US').map((v) => v.name)).toEqual([
      'Ava (Premium)',
      'Serena (Premium)',
      'Zoe (Enhanced)',
      'Samantha',
    ]);
  });

  it('prefers the exact region among equals', () => {
    expect(voicesForLocale(all, 'en-GB')[0].name).toBe('Serena (Premium)');
  });
});

describe('bestVoiceId', () => {
  it('picks the best premium or enhanced voice for the language', () => {
    expect(bestVoiceId([compact, enhanced, premium], 'en-US')).toBe(
      premium.identifier
    );
    expect(bestVoiceId([compact, enhanced], 'en-US')).toBe(enhanced.identifier);
  });

  it('leaves the choice to the system when only ordinary voices are installed', () => {
    expect(bestVoiceId([compact, novelty], 'en-US')).toBeNull();
    expect(hasBetterVoice([compact], 'en-US')).toBe(false);
  });

  it('does not borrow a voice from another language', () => {
    expect(bestVoiceId([french], 'en-US')).toBeNull();
  });
});
