import fs from 'fs';
import path from 'path';

/**
 * Regression contract: Android API 33+ classes and overloads
 * (android.app.LocaleManager, applicationLocales, systemLocales, and the
 * Intent.getParcelableExtra(String, Class<T>) overload) must be isolated in
 * dedicated API 33 helper classes so the class verifier on Android <=12 never
 * resolves them during module/object registration. A direct reference in a
 * class that is loaded unconditionally can raise NoClassDefFoundError /
 * VerifyError before any SDK_INT guard runs.
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
 * references, member accesses, and method overload resolutions can.
 */
function stripComments(src: string): string {
  let result = src;
  // Remove block comments /* ... */ (non-greedy, across newlines).
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments // ...
  result = result.replace(/^\s*\/\/.*$/gm, '');
  return result;
}

/**
 * Extract the body of a Kotlin `fun` (including the @ReactMethod annotation
 * line if present) using a brace-balanced scan. This scopes guard-vs-helper
 * assertions to a single method body, so a guard from another method can no
 * longer satisfy the assertion for a different method (CodeRabbit finding on
 * PR #2259).
 *
 * The scan starts at the first `fun name(` occurrence and returns the text
 * from the first `{` to its matching `}`. String literals and comments inside
 * the body are left as-is; for the assertions in this file that is safe
 * because they look for specific Kotlin expressions that do not appear as
 * string literals in the audited sources.
 */
function extractFunctionBody(source: string, functionName: string): string {
  const functionIndex = source.indexOf(`fun ${functionName}(`);
  if (functionIndex === -1) {
    throw new Error(`Function ${functionName} not found`);
  }

  const openBrace = source.indexOf('{', functionIndex);
  if (openBrace === -1) {
    throw new Error(`Function body for ${functionName} not found`);
  }

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, i);
      }
    }
  }
  throw new Error(`Unterminated function body for ${functionName}`);
}

describe('Android API 33 isolation contract (issue #2253)', () => {
  describe('common language bridge layer (loaded unconditionally)', () => {
    it('1. AppLanguageModule.kt has no code reference to LocaleManager (imports, types, calls)', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt'));
      expect(code).not.toMatch(/import\s+android\.app\.LocaleManager/);
      expect(code).not.toMatch(/LocaleManager\b/);
    });

    it('1a. AppLanguageModule.kt uses generated locale placeholders, not hardcoded locale lists', () => {
      // The native supported-locale list MUST be generated from the central
      // localeRegistry by the withAppLanguage config plugin. Hardcoding
      // "en"/"pl" would silently break the next shipped locale.
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt');
      expect(src).toMatch(/\{\{SUPPORTED_LOCALES\}\}/);
      expect(src).toMatch(/\{\{FALLBACK_LOCALE\}\}/);
      expect(src).not.toMatch(/setOf\(\s*"en"\s*,\s*"pl"\s*\)/);
    });

    it('AppLanguagePackage.kt has no code reference to LocaleManager', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguagePackage.kt'));
      expect(code).not.toMatch(/LocaleManager\b/);
    });

    it('6. AppLanguageModule guards API 33 calls with SDK_INT before delegating (per method body)', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt');

      // setApplicationLanguage: guard before helper, inside the same body.
      const setBody = extractFunctionBody(src, 'setApplicationLanguage');
      const setGuard = setBody.indexOf('Build.VERSION.SDK_INT < API_33');
      const setDelegate = setBody.indexOf('AppLanguageApi33.setApplicationLanguage');
      expect(setGuard).toBeGreaterThan(-1);
      expect(setDelegate).toBeGreaterThan(-1);
      expect(setDelegate).toBeGreaterThan(setGuard);

      // getApplicationLanguage: its OWN guard before its OWN helper call.
      const getBody = extractFunctionBody(src, 'getApplicationLanguage');
      const getGuard = getBody.indexOf('Build.VERSION.SDK_INT < API_33');
      const getDelegate = getBody.indexOf('AppLanguageApi33.getApplicationLanguage');
      expect(getGuard).toBeGreaterThan(-1);
      expect(getDelegate).toBeGreaterThan(-1);
      expect(getDelegate).toBeGreaterThan(getGuard);

      // getEffectiveLanguage: its OWN >= API_33 branch before its OWN helper.
      const effBody = extractFunctionBody(src, 'getEffectiveLanguage');
      const effGuard = effBody.indexOf('Build.VERSION.SDK_INT >= API_33');
      const effDelegate = effBody.indexOf('AppLanguageApi33.getApplicationLanguageTag');
      expect(effGuard).toBeGreaterThan(-1);
      expect(effDelegate).toBeGreaterThan(-1);
      expect(effDelegate).toBeGreaterThan(effGuard);
    });

    it('7. AppLanguageModule never reaches the API 33 helper on the API <=32 path (per method body)', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt');

      // Each method body must contain its OWN guard before its helper call.
      // A guard from another method must not satisfy this assertion.
      const cases: { fn: string; guard: string; helper: string }[] = [
        { fn: 'setApplicationLanguage', guard: 'Build.VERSION.SDK_INT < API_33', helper: 'AppLanguageApi33.setApplicationLanguage' },
        { fn: 'getApplicationLanguage', guard: 'Build.VERSION.SDK_INT < API_33', helper: 'AppLanguageApi33.getApplicationLanguage' },
        { fn: 'getEffectiveLanguage', guard: 'Build.VERSION.SDK_INT >= API_33', helper: 'AppLanguageApi33.getApplicationLanguageTag' },
      ];

      for (const { fn, guard, helper } of cases) {
        const body = extractFunctionBody(src, fn);
        const guardIdx = body.indexOf(guard);
        const helperIdx = body.indexOf(helper);
        expect(guardIdx).toBeGreaterThan(-1);
        expect(helperIdx).toBeGreaterThan(-1);
        expect(helperIdx).toBeGreaterThan(guardIdx);
      }
    });

    it('7a. extractFunctionBody scopes guards per method (mutation regression)', () => {
      // Prove the test above would FAIL if getApplicationLanguage lost its
      // own guard. We synthesize a source where that guard is removed and
      // assert the helper still appears WITHOUT the guard in the same body —
      // which is exactly the regression the per-method test must catch.
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageModule.kt');
      const getBody = extractFunctionBody(src, 'getApplicationLanguage');

      // Sanity: the real source has the guard.
      expect(getBody).toContain('Build.VERSION.SDK_INT < API_33');

      // Mutate: remove the guard from getApplicationLanguage only.
      const mutatedGetBody = getBody.replace(
        /if \(Build\.VERSION\.SDK_INT < API_33\)\s*\{[^}]*\}/,
        '',
      );
      // Confirm the mutation removed the guard but left the helper call.
      expect(mutatedGetBody).not.toContain('Build.VERSION.SDK_INT < API_33');
      expect(mutatedGetBody).toContain('AppLanguageApi33.getApplicationLanguage');

      // Reconstruct the full source with the mutated body so the per-method
      // extraction in test 7 would see the missing guard. We replace the
      // original body in the source by locating the function boundaries.
      const fnStart = src.indexOf('fun getApplicationLanguage(');
      const openBrace = src.indexOf('{', fnStart);
      // Find the matching close brace using the same balanced scan.
      let depth = 0;
      let closeBrace = -1;
      for (let i = openBrace; i < src.length; i += 1) {
        if (src[i] === '{') depth += 1;
        if (src[i] === '}') {
          depth -= 1;
          if (depth === 0) { closeBrace = i; break; }
        }
      }
      expect(closeBrace).toBeGreaterThan(openBrace);
      const mutatedSrc =
        src.slice(0, openBrace + 1) + mutatedGetBody + src.slice(closeBrace);

      // Now extract the mutated body and verify the guard is gone while the
      // helper call remains — this is the condition test 7 rejects.
      const reExtracted = extractFunctionBody(mutatedSrc, 'getApplicationLanguage');
      expect(reExtracted).not.toContain('Build.VERSION.SDK_INT < API_33');
      expect(reExtracted).toContain('AppLanguageApi33.getApplicationLanguage');
    });
  });

  describe('widget locale layer (object loaded on first reference)', () => {
    it('2. WidgetLocale.kt.tmpl has no code reference to LocaleManager (imports, types, calls)', () => {
      const code = stripComments(readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl'));
      expect(code).not.toMatch(/import\s+android\.app\.LocaleManager/);
      expect(code).not.toMatch(/LocaleManager\b/);
      expect(code).not.toMatch(/\.applicationLocales\s*=/);
      expect(code).not.toMatch(/getSystemService\(LocaleManager/);
    });

    it('3. WidgetLocale.kt.tmpl does not call the API 33 getParcelableExtra(String, Class) overload', () => {
      const code = stripComments(readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl'));
      // The API 33+ overload is getParcelableExtra(name, Class<T>). The legacy
      // single-arg overload (API 1) is fine, so we look for the two-arg form.
      // Match `getParcelableExtra(` followed by a name and a `,` and a Class.
      expect(code).not.toMatch(/getParcelableExtra\(\s*[\w.]+\s*,\s*\w+::class\.java\s*\)/);
      // Also reject the type-token form with an explicit Class reference.
      expect(code).not.toMatch(/getParcelableExtra\([^)]*::class\.java\)/);
    });

    it('WidgetLocale.kt.tmpl delegates EXTRA_LOCALE_LIST read to WidgetLocaleApi33', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl');
      const broadcastFn = src.indexOf('fun refreshEffectiveRenderLocaleFromBroadcast');
      const helperCall = src.indexOf('WidgetLocaleApi33.getLocaleListExtra', broadcastFn);
      expect(broadcastFn).toBeGreaterThan(-1);
      expect(helperCall).toBeGreaterThan(broadcastFn);
    });

    it('6. WidgetLocale delegates to WidgetLocaleApi33 only behind isNativeAppLanguageSupported (per method body)', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocale.kt.tmpl');

      // Each method must contain its OWN guard before its helper call, scoped
      // to the method body so a guard from another method cannot satisfy it.
      const cases: { fn: string; helper: string }[] = [
        { fn: 'refreshEffectiveRenderLocaleFromBroadcast', helper: 'WidgetLocaleApi33.getLocaleListExtra' },
        { fn: 'systemPlatformLanguage', helper: 'WidgetLocaleApi33.systemPlatformLanguage' },
        { fn: 'currentPlatformLanguage', helper: 'WidgetLocaleApi33.currentPlatformLanguage' },
      ];

      for (const { fn, helper } of cases) {
        const body = extractFunctionBody(src, fn);
        const guardIdx = body.indexOf('isNativeAppLanguageSupported()');
        const helperIdx = body.indexOf(helper);
        expect(guardIdx).toBeGreaterThan(-1);
        expect(helperIdx).toBeGreaterThan(-1);
        expect(helperIdx).toBeGreaterThan(guardIdx);
      }
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
    it('4. AppLanguageApi33.kt is @RequiresApi(33) and owns LocaleManager', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt');
      expect(src).toMatch(/import\s+android\.app\.LocaleManager/);
      expect(src).toMatch(/@RequiresApi\(Build\.VERSION_CODES\.TIRAMISU\)/);
      expect(src).toMatch(/LocaleManager\?/);
      expect(src).toMatch(/applicationLocales/);
    });

    it('5. AppLanguageApi33 methods executing API 33 calls are @DoNotInline', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt');
      // Every public method that touches LocaleManager/applicationLocales must
      // carry @DoNotInline so R8/ART does not inline it back into the caller.
      const methods = ['setApplicationLanguage', 'getApplicationLanguage', 'getApplicationLanguageTag'];
      for (const m of methods) {
        const fnIdx = src.indexOf(`fun ${m}(`);
        expect(fnIdx).toBeGreaterThan(-1);
        // @DoNotInline must appear before the function (annotations precede fun).
        const dontInline = src.lastIndexOf('@DoNotInline', fnIdx);
        const prevFun = src.lastIndexOf('fun ', fnIdx - 1);
        // The @DoNotInline must be between the previous function and this one.
        expect(dontInline).toBeGreaterThan(prevFun);
        expect(dontInline).toBeLessThan(fnIdx);
      }
    });

    it('AppLanguageApi33 does not expose LocaleManager across the boundary', () => {
      const src = readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt');
      // Public methods (no `private` modifier) must return String? (safe on
      // minSdk), not LocaleManager?. A private helper inside Api33 may return
      // LocaleManager? because it never crosses the helper boundary.
      const publicFns = src.match(/(?:^|\n)\s*fun\s+\w+\s*\([^)]*\)\s*:\s*\w+/g) ?? [];
      const privateFns = src.match(/(?:^|\n)\s*private\s+fun\s+\w+\s*\([^)]*\)\s*:\s*\w+/g) ?? [];
      const publicSet = new Set(publicFns);
      for (const fn of privateFns) publicSet.delete(fn.replace(/\n\s*/, '').trim());
      for (const fn of publicSet) {
        expect(fn).not.toMatch(/:\s*LocaleManager\??/);
      }
    });

    it('AppLanguageApi33 does not duplicate SDK_INT guard (caller-guarded via @RequiresApi)', () => {
      const code = stripComments(readSource(LANGUAGE_ROOT, 'AppLanguageApi33.kt'));
      expect(code).not.toMatch(/Build\.VERSION\.SDK_INT/);
    });

    it('4. WidgetLocaleApi33.kt.tmpl is @RequiresApi(33) and owns LocaleManager', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl');
      expect(src).toMatch(/import\s+android\.app\.LocaleManager/);
      expect(src).toMatch(/@RequiresApi\(Build\.VERSION_CODES\.TIRAMISU\)/);
      expect(src).toMatch(/LocaleManager::class\.java/);
      expect(src).toMatch(/systemLocales/);
      expect(src).toMatch(/applicationLocales/);
    });

    it('WidgetLocaleApi33 owns the API 33 getParcelableExtra(String, Class) overload', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl');
      expect(src).toMatch(/getParcelableExtra\(\s*Intent\.EXTRA_LOCALE_LIST,\s*LocaleList::class\.java\s*\)/);
    });

    it('5. WidgetLocaleApi33 methods executing API 33 calls are @DoNotInline', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl');
      const methods = ['getLocaleListExtra', 'systemPlatformLanguage', 'currentPlatformLanguage'];
      for (const m of methods) {
        const fnIdx = src.indexOf(`fun ${m}(`);
        expect(fnIdx).toBeGreaterThan(-1);
        const dontInline = src.lastIndexOf('@DoNotInline', fnIdx);
        const prevFun = src.lastIndexOf('fun ', fnIdx - 1);
        expect(dontInline).toBeGreaterThan(prevFun);
        expect(dontInline).toBeLessThan(fnIdx);
      }
    });

    it('WidgetLocaleApi33 does not expose LocaleManager across the boundary', () => {
      const src = readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl');
      const publicFns = src.match(/(?:^|\n)\s*fun\s+\w+\s*\([^)]*\)\s*:\s*\w+/g) ?? [];
      const privateFns = src.match(/(?:^|\n)\s*private\s+fun\s+\w+\s*\([^)]*\)\s*:\s*\w+/g) ?? [];
      const publicSet = new Set(publicFns);
      for (const fn of privateFns) publicSet.delete(fn.replace(/\n\s*/, '').trim());
      for (const fn of publicSet) {
        expect(fn).not.toMatch(/:\s*LocaleManager\??/);
      }
    });

    it('WidgetLocaleApi33 does not duplicate SDK_INT guard (caller-guarded via @RequiresApi)', () => {
      const code = stripComments(readSource(WIDGET_ROOT, 'WidgetLocaleApi33.kt.tmpl'));
      expect(code).not.toMatch(/Build\.VERSION\.SDK_INT/);
    });
  });

  describe('no other widget Kotlin source references API 33 surface', () => {
    const otherFiles = [
      'CalorieWidgetModule.kt.tmpl',
      'CalorieWidgetReceiver.kt.tmpl',
      'CalorieWidget.kt.tmpl',
      'MacroWidget.kt.tmpl',
      'MacroWidgetReceiver.kt.tmpl',
      'CalorieWidgetPackage.kt',
    ];

    it.each(otherFiles)('%s does not reference LocaleManager or the API 33 overload', (file) => {
      const code = stripComments(readSource(WIDGET_ROOT, file));
      expect(code).not.toMatch(/LocaleManager\b/);
      expect(code).not.toMatch(/getParcelableExtra\([^)]*::class\.java\)/);
    });
  });
});
