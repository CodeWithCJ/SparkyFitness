import { guidedExerciseImages } from '@/pages/Diary/useWorkoutPlaybackGuided';

describe('guidedExerciseImages', () => {
  it('prefers the library images', () => {
    expect(
      guidedExerciseImages({
        images: ['Squat/0.jpg', 'Squat/1.jpg'],
        image_url: 'custom.jpg',
      })
    ).toEqual(['Squat/0.jpg', 'Squat/1.jpg']);
  });

  it('falls back to the single image_url', () => {
    expect(guidedExerciseImages({ image_url: 'custom.jpg' })).toEqual([
      'custom.jpg',
    ]);
  });

  it('shows no image for a stray "[" kept in a draft saved before the fix', () => {
    expect(guidedExerciseImages({ image_url: '[' })).toEqual([]);
  });
});
