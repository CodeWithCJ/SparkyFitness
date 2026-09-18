import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom';
import MoodMeter from '@/pages/CheckIn/MoodMeter';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, arg?: unknown) =>
      typeof arg === 'string'
        ? arg
        : ((arg as { defaultValue?: string } | undefined)?.defaultValue ?? key),
  }),
}));

jest.mock('@/hooks/CheckIn/useMood', () => ({
  useCustomMoods: () => ({ data: [] }),
  useCreateCustomMoodMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteCustomMoodMutation: () => ({ mutate: jest.fn() }),
  useMoodDisplayPreferences: () => ({ data: { hidden_moods: [] } }),
  useUpdateMoodDisplayPreferencesMutation: () => ({ mutate: jest.fn() }),
}));

// The slider's own bounds. Derived here rather than imported so the test states
// the geometry independently of the table the component builds it from.
const MOOD_MIN = 10;
const MOOD_MAX = 95;
const MOOD_STEP = 5;

/** Where Radix parks the thumb for a value, as a share of its travel. */
const thumbPercent = (value: number) =>
  ((value - MOOD_MIN) / (MOOD_MAX - MOOD_MIN)) * 100;

/** Every value the thumb can come to rest on. */
const stops = Array.from(
  { length: (MOOD_MAX - MOOD_MIN) / MOOD_STEP + 1 },
  (_, i) => MOOD_MIN + i * MOOD_STEP
);

const renderMeter = (mood = 50) => {
  const onMoodChange = jest.fn();
  const { container } = render(
    <MoodMeter
      mood={mood}
      notes=""
      moodTags={[]}
      onMoodChange={onMoodChange}
      onNotesChange={jest.fn()}
      onTagsChange={jest.fn()}
    />
  );
  return { container, onMoodChange };
};

/** The nine legend faces: the only buttons in the meter carrying a `title`. */
const legendFaces = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('button[title]'));

/** The value a face writes when tapped. */
const valueWrittenBy = (
  face: HTMLButtonElement,
  onMoodChange: jest.Mock
): number => {
  onMoodChange.mockClear();
  fireEvent.click(face);
  return onMoodChange.mock.calls[0]![0] as number;
};

describe('MoodMeter band legend', () => {
  // The reported bug (#2369): spread evenly, the legend drifted from the thumb
  // the further right you went.
  test('draws every face exactly where the thumb lands for the value it writes', () => {
    const { container, onMoodChange } = renderMeter();
    const faces = legendFaces(container);

    expect(faces).toHaveLength(9);
    faces.forEach((face) => {
      const value = valueWrittenBy(face, onMoodChange);
      expect(parseFloat(face.style.left)).toBeCloseTo(thumbPercent(value), 5);
    });
  });

  test('puts a face on every second stop', () => {
    const { container } = renderMeter();
    const lefts = legendFaces(container).map((face) =>
      parseFloat(face.style.left)
    );

    expect(lefts.map((l) => Number(l.toFixed(2)))).toEqual([
      0, 11.76, 23.53, 35.29, 47.06, 58.82, 70.59, 82.35, 94.12,
    ]);
    // Spread evenly the happy face sat at 87.5%, while its own value puts the
    // thumb at 82.35%: a tenth of the width apart.
    expect(lefts[7]).not.toBeCloseTo(87.5, 1);
  });

  // What the reporter saw after the faces were pinned: dragging still left a
  // gap, because a band held two stops and the face marked only one of them.
  test('leaves every stop either on a face or exactly half-way between two', () => {
    const { container } = renderMeter();
    const lefts = legendFaces(container).map((face) =>
      parseFloat(face.style.left)
    );
    const halfGap = (lefts[1]! - lefts[0]!) / 2;

    stops.forEach((value) => {
      const nearest = Math.min(
        ...lefts.map((left) => Math.abs(thumbPercent(value) - left))
      );
      expect([0, halfGap].some((d) => Math.abs(nearest - d) < 0.001)).toBe(
        true
      );
    });
  });

  test('insets the row by half a thumb, the way the thumb travel is inset', () => {
    const { container } = renderMeter();
    const row = legendFaces(container)[0]!.parentElement!.parentElement!;

    expect(row.style.paddingLeft).toBe('10px');
    expect(row.style.paddingRight).toBe('10px');
  });

  test('never writes a value the slider cannot show', () => {
    const { container, onMoodChange } = renderMeter();
    const faces = legendFaces(container);

    // "Sad" spans 0-15, so its midpoint is 8 -- under the slider's own minimum.
    expect(valueWrittenBy(faces[0]!, onMoodChange)).toBe(MOOD_MIN);
    faces.forEach((face) => {
      const value = valueWrittenBy(face, onMoodChange);
      expect(value).toBeGreaterThanOrEqual(MOOD_MIN);
      expect(value).toBeLessThanOrEqual(MOOD_MAX);
    });
  });
});

describe('MoodMeter header', () => {
  test.each([
    [10, '😢', 'Sad'],
    [50, '🤔', 'Thoughtful'],
    [65, '🙂', 'Calm'],
    [100, '😍', 'Excited'],
  ])('at %i it names the band it highlights', (mood, emoji, label) => {
    const { container } = renderMeter(mood);
    const active = legendFaces(container).find((face) =>
      face.className.includes('scale-125')
    );

    expect(container.querySelector('span.font-medium')).toHaveTextContent(
      `${emoji}${label}`
    );
    expect(active?.title).toBe(label);
    expect(active?.textContent).toBe(emoji);
  });
});

describe('MoodMeter with a value from outside the picker', () => {
  // A CSV import may carry 96-100, and rows logged before the picker stopped at
  // 95 still hold them. Radix reports the controlled value verbatim, so passing
  // one straight through announces a mood above the maximum it declares.
  test('keeps the thumb it announces inside the range it declares', () => {
    const { container } = renderMeter(100);
    const thumb = container.querySelector('[role="slider"]')!;
    const now = Number(thumb.getAttribute('aria-valuenow'));

    expect(now).toBeLessThanOrEqual(
      Number(thumb.getAttribute('aria-valuemax'))
    );
    expect(now).toBeGreaterThanOrEqual(
      Number(thumb.getAttribute('aria-valuemin'))
    );
  });

  test('still reads the value back as the band it belongs to', () => {
    const { container } = renderMeter(100);

    expect(container.querySelector('span.font-medium')).toHaveTextContent(
      '😍Excited'
    );
  });

  test('leaves the stored value alone until the slider is moved', () => {
    const { onMoodChange } = renderMeter(100);

    // Clamping is for display: a day opened and saved untouched keeps its 100.
    expect(onMoodChange).not.toHaveBeenCalled();
  });
});
