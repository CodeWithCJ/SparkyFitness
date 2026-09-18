import { getMoodDisplay } from '@/utils/moodUtils';
import { moodValueToTag } from '@workspace/shared';

// The band table, stated here rather than imported, so the test pins the
// mapping instead of restating whatever the implementation happens to read.
const BANDS = [
  { upTo: 15, emoji: '😢', label: 'Sad' },
  { upTo: 25, emoji: '😠', label: 'Angry' },
  { upTo: 35, emoji: '😟', label: 'Worried' },
  { upTo: 45, emoji: '😐', label: 'Neutral' },
  { upTo: 55, emoji: '🤔', label: 'Thoughtful' },
  { upTo: 65, emoji: '🙂', label: 'Calm' },
  { upTo: 75, emoji: '😎', label: 'Confident' },
  { upTo: 85, emoji: '😀', label: 'Happy' },
  { upTo: 100, emoji: '😍', label: 'Excited' },
];

const expected = (value: number) => {
  const band = BANDS.find((b) => value <= b.upTo) ?? BANDS[BANDS.length - 1]!;
  return { emoji: band.emoji, label: band.label };
};

describe('getMoodDisplay', () => {
  test('matches the band table across the whole scale', () => {
    for (let value = 0; value <= 100; value += 1) {
      expect(getMoodDisplay(value)).toEqual(expected(value));
    }
  });

  test('labels a value the way the check-in page does', () => {
    // The reported inconsistency: Reports and the CSV preview carried their own
    // bands, cut ten points below the shared ones, so a day logged as one mood
    // was read back as the one below it.
    for (let value = 10; value <= 100; value += 1) {
      expect(getMoodDisplay(value).label.toLowerCase()).toBe(
        moodValueToTag(value)
      );
    }
  });

  test.each([
    [10, 'Sad', 'Tired'],
    [50, 'Thoughtful', 'Neutral'],
    [70, 'Confident', 'Calm'],
    [80, 'Happy', 'Confident'],
    [90, 'Excited', 'Happy'],
  ])('reads %i as %s, not %s', (value, now, before) => {
    expect(getMoodDisplay(value).label).toBe(now);
    expect(getMoodDisplay(value).label).not.toBe(before);
  });

  test('never reports "Tired", which is not part of the numeric scale', () => {
    // It is a descriptive tag, chosen alongside the rating and carrying no band.
    for (let value = 0; value <= 100; value += 1) {
      expect(getMoodDisplay(value).label).not.toBe('Tired');
    }
  });

  test('falls back to neutral when nothing was logged', () => {
    expect(getMoodDisplay(null)).toEqual({ emoji: '😐', label: 'Neutral' });
  });
});
