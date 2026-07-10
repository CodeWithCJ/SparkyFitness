import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('settings localization contract', () => {
  it('keeps app preferences Arabic and accessible', () => {
    const source = read('src/screens/AppSettingsScreen.tsx');

    expect(source).toContain("mobileT('screens.appSettings')");
    expect(source).toContain("mobileT('appSettings.theme')");
    expect(source).toContain('accessibilityLabel={mobileT(');
    expect(source).not.toContain('Haptic Feedback');
    expect(source).not.toContain('Camera shutter');
  });

  it('keeps dashboard preferences Arabic with localized units', () => {
    const source = read('src/screens/DashboardSettingsScreen.tsx');

    expect(source).toContain("mobileT('screens.dashboardSettings')");
    expect(source).toContain('localizeServingUnit(cn.unit)');
    expect(source).not.toContain('Custom Nutrient Display');
    expect(source).not.toContain('Show the fasting card');
    expect(source).not.toContain('Failed to update setting.');
  });
});
