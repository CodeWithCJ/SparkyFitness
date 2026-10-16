import type { TFunction } from 'i18next';
import {
  MINDFULNESS_SESSION_TYPES,
  mindfulnessSessionTypeEmoji,
  mindfulnessSessionTypeLabel,
  offeredMindfulnessSessionType,
} from '../../src/utils/mindfulnessSessionTypes';

// Echoes the English fallback, which is what an untranslated key shows.
const t = ((_key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? _key) as unknown as TFunction;

describe('mindfulness session types', () => {
  it('names and illustrates every type the log form offers', () => {
    expect(
      MINDFULNESS_SESSION_TYPES.map(
        (type) =>
          `${mindfulnessSessionTypeEmoji(type)} ${mindfulnessSessionTypeLabel(type, t)}`
      )
    ).toEqual([
      '🧘 Meditation',
      '🌊 Breathwork',
      '🪞 Reflection',
      '🚶 Mindful Walking',
      '🧘‍♀️ Yoga',
      '🎧 Guided',
      '🕯️ Unguided',
      '✨ Other',
    ]);
  });

  it('reads a type the app does not offer as Other', () => {
    // Another client or an import can store a type this list does not have.
    expect(mindfulnessSessionTypeLabel('sound_bath', t)).toBe('Other');
    expect(mindfulnessSessionTypeEmoji('sound_bath')).toBe('✨');
    expect(mindfulnessSessionTypeLabel(null, t)).toBe('Other');
    expect(mindfulnessSessionTypeEmoji(undefined)).toBe('✨');
  });

  it('picks the chip a stored type shows as, Other when it is not offered', () => {
    for (const type of MINDFULNESS_SESSION_TYPES) {
      expect(offeredMindfulnessSessionType(type)).toBe(type);
    }
    expect(offeredMindfulnessSessionType('sound_bath')).toBe('other');
    expect(offeredMindfulnessSessionType(null)).toBe('other');
  });
});
