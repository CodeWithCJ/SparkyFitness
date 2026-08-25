import fs from 'fs';
import path from 'path';

/**
 * Regression contract: Android API 33+ classes (android.app.LocaleManager,
 * applicationLocales, systemLocales) must be isolated in dedicated API 33
 * helper classes so the class verifier on Android <=12 never resolves them
 * during module/object registration. A direct reference in a class that is
 * loaded unconditionally can raise NoClassDefFoundError / VerifyError before
 * any SDK_INT guard runs.
 *
 * See https://github.com/CodeWithCJ/SparkyFitness/issues/2253
 */

const LANGUAGE_ROOT = path.join(
  __dirname,
  '../../targets/android-language/kotlin/com/sparkyapps/sparkyfitness/language',
);
const WIDGET_ROOT = path.join(
  __dirname,
  '../../targets/android-widget/kotlin/com/sparkyapps/sparkyfitness/widget',
);

function readSource(relativeRoot: string, file: string): string {
  return fs.readFileSync(path.join(relativeRoot, file), 'utf8');
}

/**
 * Strip Kotlin comments (line and block) so contract tests only inspect
 * actual code references, not documentation mentions. `LocaleManager` appearing
 * in a KDoc comment cannot cause a class-verifier error; only imports, type
 * references, and member accesses can.
 */
function stripComments(src: string): string {
  let result = src;
  // Remove block comments /* ... */ (non-greedy, across newlines).
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments // ...
  result = result.replace(/^\s*\/\/.*$/gm, '');
  return result;
}

describe('Android API 33 isolation contract (issue #2253)', () => {
  describe('common language bridge layer (loaded unconditionally)', () => {
    it('AppLanguageModule.kt has no code reference to LocaleManager (imports, types, calls)', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt'));
      expect(code).not.toMatch(/import\s+android\.app\.LocaleManager/);
      expect(code).not.toMatch(/LocaleManager\b/);
    });

    it('AppLanguagePackage.kt has no code reference to LocaleManager', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguagePackage.kt'));
      expect(code).not.toMatch(/LocaleManager\b/);
    });

    it('AppLanguageModule guards API 33 calls with SDK_INT before delegating', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt');
      // setApplicationLanguage must guard before calling the API 33 helper.
      const setGuard = src.indexOf('Build.VERSION.SDK_INT < API_33');
      const setDelegate = src.indexOf('AppLanguageApi33.setApplicationLanguage');
      expect(setGuard).toBeGreaterThan(-1);
      expect(setDelegate).toBeGreaterThan(-1);
      expect(setDelegate).toBeGreaterThan(setGuard);

      // getEffectiveLanguage has an SDK_INT >= API_33 branch.
      expect(src).toMatch(/Build\.VERSION\.SDK_INT\s*>=\s*API_33/);
    });
  });

  describe('widget locale layer (object loaded on first reference)', () => {
    it('WidgetLocale.kt.tmpl has no code reference to LocaleManager (imports, types, calls)', () => {
      const code = stripComments(readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl'));
      expect(code).not.toMatch(/import\s+android\.app\.LocaleManager/);
      expect(code).not.toMatch(/LocaleManager\b/);
      // No direct member-access on a LocaleManager instance in this file.
      expect(code).not.toMatch(/\.applicationLocales\s*=/);
      expect(code).not.toMatch(/getSystemService\(LocaleManager/);
    });

    it('WidgetLocale.kt.tmpl delegates to WidgetLocaleApi33 behind isNativeAppLanguageSupported', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl');
      const systemFn = src.indexOf('fun systemPlatformLanguage');
      const systemBody = src.indexOf('WidgetLocaleApi33.systemPlatformLanguage', systemFn);
      const currentFn = src.indexOf('fun currentPlatformLanguage');
      const currentBody = src.indexOf('WidgetLocaleApi33.currentPlatformLanguage', currentFn);

      expect(systemFn).toBeGreaterThan(-1);
      expect(systemBody).toBeGreaterThan(systemFn);
      expect(currentFn).toBeGreaterThan(-1);
      expect(currentBody).toBeGreaterThan(currentFn);

      // Each delegate must be preceded by the guard inside its body.
      const systemGuard = src.indexOf('isNativeAppLanguageSupported()', systemFn);
      expect(systemGuard).toBeGreaterThan(systemFn);
      expect(systemGuard).toBeLessThan(systemBody);

      const currentGuard = src.indexOf('isNativeAppLanguageSupported()', currentFn);
      expect(currentGuard).toBeGreaterThan(currentFn);
      expect(currentGuard).toBeLessThan(currentBody);
    });

    it('WidgetLocale.kt.tmpl still mentions applicationLocales/systemLocales in comments (contract doc)', () => {
      // The existing widgetResourceContract.test.ts asserts these tokens
      // appear. They remain in the KDoc and are allowed in comments.
      const src = readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl');
      expect(src).toMatch(/applicationLocales/);
      expect(src).toMatch(/systemLocales/);
    });
  });

  describe('isolated API 33 helpers (loaded only after SDK_INT guard)', () => {
    it('AppLanguageApi33.kt is the sole LocaleManager owner for the language bridge', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt');
      expect(src).toMatch(/import\s+android\.app\.LocaleManager/);
      expect(src).toMatch(/@RequiresApi\(Build\.VERSION_CODES\.TIRAMISU\)/);
      expect(src).toMatch(/LocaleManager\?/);
      expect(src).toMatch(/applicationLocales/);
    });

    it('WidgetLocaleApi33.kt.tmpl is the sole LocaleManager owner for widgets', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl');
      expect(src).toMatch(/import\s+android\.app\.LocaleManager/);
      expect(src).toMatch(/@RequiresApi\(Build\.VERSION_CODES\.TIRAMISU\)/);
      expect(src).toMatch(/LocaleManager::class\.java/);
      expect(src).toMatch(/systemLocales/);
      expect(src).toMatch(/applicationLocales/);
    });

    it('AppLanguageApi33 does not duplicate SDK_INT guard (caller-guarded via @RequiresApi)', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt'));
      // The helper is annotated @RequiresApi(33) and is only referenced after
      // the caller's SDK_INT guard. It must not duplicate that guard because
      // lint would flag the unreachable branch.
      expect(code).not.toMatch(/Build\.VERSION\.SDK_INT/);
    });

    it('WidgetLocaleApi33 does not duplicate SDK_INT guard (caller-guarded via @RequiresApi)', () => {
      const code = stripComments(readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl'));
      expect(code).not.toMatch(/Build\.VERSION\.SDK_INT/);
    });
  });

  describe('no other widget Kotlin source references LocaleManager', () => {
    const otherFiles = [
      'CalorieWidgetModule.kt.tmpl',
      'CalorieWidgetReceiver.kt.tmpl',
      'CalorieWidget.kt.tmpl',
      'MacroWidget.kt.tmpl',
      'MacroWidgetReceiver.kt.tmpl',
      'CalorieWidgetPackage.kt',
    ];

    it.each(otherFiles)('%s does not reference LocaleManager', (file) => {
      const code = stripComments(readSource(WIDGET_ROOT, file));
      expect(code).not.toMatch(/LocaleManager\b/);
    });
  });
});
