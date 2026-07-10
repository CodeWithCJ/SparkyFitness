import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('exercise and workout search localization contract', () => {
  it('keeps exercise search Arabic across saved and online results', () => {
    const source = read('src/screens/ExerciseSearchScreen.tsx');

    expect(source).toContain('localizeExerciseCategory(item.category)');
    expect(source).toContain("mobileT('exerciseSearch.online')");
    expect(source).not.toContain('Failed to search exercises');
    expect(source).not.toContain('Load More');
    expect(source).not.toContain('Connect to a server');
  });

  it('keeps workout preset search Arabic with Arabic exercise counts', () => {
    const source = read('src/screens/PresetSearchScreen.tsx');

    expect(source).toContain('formatMobileExerciseCount(item.exercises.length)');
    expect(source).toContain("mobileT('presetSearch.startFromScratch')");
    expect(source).not.toContain('Empty workout');
    expect(source).not.toContain('No presets yet');
    expect(source).not.toContain('Search presets...');
  });
});
