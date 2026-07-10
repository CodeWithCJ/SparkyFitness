import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/FoodSearchScreen.tsx'),
  'utf8',
);

describe('food search localization contract', () => {
  it('keeps search, source switching, and coaching copy Arabic', () => {
    expect(source).toContain("mobileT('foodSearch.allSources')");
    expect(source).toContain("mobileT('foodSearch.searchPlaceholder')");
    expect(source).not.toContain("label: 'All Sources'");
    expect(source).not.toContain('title="Online provider"');
    expect(source).not.toContain('Search everything here');
    expect(source).not.toContain('Choose a source');
  });

  it('formats nutrition and result counts for Saudi Arabic', () => {
    expect(source).toContain('formatMobileCalories(');
    expect(source).toContain('formatMobileNumber(');
    expect(source).toContain('localizeServingUnit(');
    expect(source).not.toContain('} cal');
    expect(source).not.toContain('Show all {count}');
  });

  it('keeps controls and empty/error states free of English UI literals', () => {
    for (const englishCopy of [
      'No saved foods found',
      'Couldn&apos;t load',
      'No online results from',
      'Connect to a server to search foods',
      'Failed to load foods',
      'Search for a food or meal to log',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
    expect(source).not.toContain("label: 'New Food'");
    expect(source).not.toContain("label: 'New Meal'");
  });
});
