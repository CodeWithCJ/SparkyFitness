import {
  BUILT_IN_MOODS,
  moodFaceValue,
  moodValueToTag,
} from '@workspace/shared';

describe('moodFaceValue', () => {
  const faces = BUILT_IN_MOODS.filter((m) => m.band != null).map((m) => m.name);

  it('puts the nine faces on the 10-90 grid the web picker uses', () => {
    expect(faces.map(moodFaceValue)).toEqual([
      10, 20, 30, 40, 50, 60, 70, 80, 90,
    ]);
    // The raw band midpoints are 8 and 93 at the two ends.
    expect(moodFaceValue('sad')).toBe(10);
    expect(moodFaceValue('excited')).toBe(90);
  });

  it('reads each face value back as its own face', () => {
    faces.forEach((name) =>
      expect(moodValueToTag(moodFaceValue(name))).toBe(name)
    );
  });
});
