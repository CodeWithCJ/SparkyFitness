import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('library screens localization contract', () => {
  it('keeps every library list on shared Arabic copy', () => {
    const files = [
      'src/screens/FoodsLibraryScreen.tsx',
      'src/screens/MealsLibraryScreen.tsx',
      'src/screens/ExercisesLibraryScreen.tsx',
      'src/screens/WorkoutPresetsLibraryScreen.tsx',
    ];

    for (const file of files) {
      const source = read(file);
      expect(source).toContain('mobileT(');
      expect(source).not.toContain('No server configured');
      expect(source).not.toContain('Please check your connection');
      expect(source).not.toContain('Go to Settings');
    }
  });

  it('formats dynamic exercise metadata for Arabic users', () => {
    const exercises = read('src/screens/ExercisesLibraryScreen.tsx');
    const presets = read('src/screens/WorkoutPresetsLibraryScreen.tsx');

    expect(exercises).toContain('localizeExerciseCategory(item.category)');
    expect(presets).toContain('formatMobileExerciseCount(exerciseCount)');
  });
});
