import fs from 'node:fs';
import path from 'node:path';

const appSource = fs.readFileSync(
  path.resolve(__dirname, '../../App.tsx'),
  'utf8',
);

describe('mobile shell localization contract', () => {
  it('routes shell alerts through the Saudi Arabic dictionary', () => {
    expect(appSource).toContain("mobileT('alerts.noServerTitle')");
    expect(appSource).toContain("mobileT('alerts.unsavedDraft'");
    expect(appSource).toContain("mobileT('alerts.healthUnavailableTitle')");

    for (const englishCopy of [
      'No Server Connected',
      'Draft in Progress',
      'Resume Draft',
      'Discard & Continue',
      'Health Data Unavailable',
    ]) {
      expect(appSource).not.toContain(`'${englishCopy}'`);
    }
  });

  it('routes fixed native stack titles through localized screen keys', () => {
    for (const key of [
      'screens.foodsLibrary',
      'screens.mealsLibrary',
      'screens.exercisesLibrary',
      'screens.workoutPresetsLibrary',
      'screens.foodSearch',
      'screens.scanFood',
      'screens.chat',
      'screens.logs',
      'screens.sync',
      'screens.about',
      'screens.whatsNew',
    ]) {
      expect(appSource).toContain(`mobileT('${key}')`);
    }
  });
});
