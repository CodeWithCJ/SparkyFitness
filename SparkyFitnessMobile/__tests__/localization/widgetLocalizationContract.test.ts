import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('Saudi Arabic widget localization contract', () => {
  it('keeps both iOS widgets Arabic, RTL, and Arabic-number aware', () => {
    const calorie = read('targets/widget/widgets.swift');
    const macros = read('targets/widget/macroWidget.swift');
    const helpers = read('targets/widget/SharedHelpers.swift');

    for (const source of [calorie, macros]) {
      expect(source).toContain('formatArabicInteger');
      expect(source).toContain('.environment(\\.layoutDirection, .rightToLeft)');
    }
    expect(helpers).toContain('Locale(identifier: "ar_SA")');

    expect(calorie).not.toContain('kcal left');
    expect(calorie).not.toContain('Calorie Tracker');
    expect(macros).not.toContain('Protein');
    expect(macros).not.toContain('Today\'s protein');
  });

  it('keeps Android widget templates and previews Arabic and RTL', () => {
    const calorie = read(
      'targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/CalorieWidget.kt.tmpl',
    );
    const macros = read(
      'targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget/MacroWidget.kt.tmpl',
    );
    const strings = read('targets/android-widget/res/values/widget_strings.xml');
    const caloriePreview = read(
      'targets/android-widget/res/layout/sparky_widget_initial_layout.xml',
    );
    const macroPreview = read(
      'targets/android-widget/res/layout/sparky_macro_widget_initial_layout.xml',
    );

    for (const source of [calorie, macros]) {
      expect(source).toContain('Locale("ar", "SA")');
      expect(source).not.toContain('kcal left');
      expect(source).not.toContain('Search food');
      expect(source).not.toContain('Scan barcode');
    }

    expect(strings).toMatch(/[\u0600-\u06ff]/);
    expect(strings).not.toContain('Calories');
    for (const preview of [caloriePreview, macroPreview]) {
      expect(preview).toContain('android:layoutDirection="rtl"');
      expect(preview).not.toContain('kcal left');
    }
  });
});
