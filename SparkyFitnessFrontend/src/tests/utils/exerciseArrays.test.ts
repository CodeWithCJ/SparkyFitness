import { normalizeExerciseArrays } from '@/utils/exerciseArrays';

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
