import {
  firstExerciseImage,
  normalizeExerciseArrays,
} from '@/utils/exerciseArrays';

describe('normalizeExerciseArrays', () => {
  it('decodes JSON-string array columns from a freshly imported row', () => {
    const imported = {
      id: 'x',
      name: 'Cable Crossover',
      category: 'strength',
      images: '["Cable_Crossover/0.jpg"]',
      instructions: '["Pull.","Squeeze."]',
      equipment: '["cable"]',
      primary_muscles: '["chest"]',
      secondary_muscles: null,
      force: null,
      level: null,
      mechanic: null,
    } as unknown as Parameters<typeof normalizeExerciseArrays>[0];
    expect(normalizeExerciseArrays(imported)).toMatchObject({
      images: ['Cable_Crossover/0.jpg'],
      instructions: ['Pull.', 'Squeeze.'],
      equipment: ['cable'],
      primary_muscles: ['chest'],
      secondary_muscles: null,
    });
  });

  it('leaves already parsed arrays as they are', () => {
    const exercise = {
      id: 'y',
      name: 'Squat',
      category: 'strength',
      images: ['Squat/0.jpg', 'Squat/1.jpg'],
    } as unknown as Parameters<typeof normalizeExerciseArrays>[0];
    expect(normalizeExerciseArrays(exercise).images).toEqual([
      'Squat/0.jpg',
      'Squat/1.jpg',
    ]);
  });
});

describe('firstExerciseImage', () => {
  it('returns the first image of a parsed array', () => {
    expect(firstExerciseImage(['Squat/0.jpg', 'Squat/1.jpg'])).toBe(
      'Squat/0.jpg'
    );
  });

  it('decodes the stored JSON text instead of taking its first character', () => {
    expect(firstExerciseImage('["Squat/0.jpg","Squat/1.jpg"]')).toBe(
      'Squat/0.jpg'
    );
    expect(firstExerciseImage('"[\\"Squat/0.jpg\\"]"')).toBe('Squat/0.jpg');
  });

  it('keeps a single stored path or URL', () => {
    expect(firstExerciseImage('Barbell_Squat/0.jpg')).toBe(
      'Barbell_Squat/0.jpg'
    );
    expect(firstExerciseImage('https://example.com/squat.jpg')).toBe(
      'https://example.com/squat.jpg'
    );
  });

  it('ignores the stray characters earlier preset saves stored', () => {
    expect(firstExerciseImage('[')).toBeUndefined();
    expect(firstExerciseImage('"')).toBeUndefined();
  });

  it('returns undefined when there is no image', () => {
    expect(firstExerciseImage(undefined)).toBeUndefined();
    expect(firstExerciseImage(null)).toBeUndefined();
    expect(firstExerciseImage('')).toBeUndefined();
    expect(firstExerciseImage('[]')).toBeUndefined();
    expect(firstExerciseImage([])).toBeUndefined();
  });
});
