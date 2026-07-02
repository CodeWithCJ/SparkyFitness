import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');

const NATIVE_TABS_ROUTE_EXCLUSIONS = {
  Onboarding: 'First-run setup route shown before the tab host exists.',
  FoodsLibrary: 'Root-stack library drill-in presented above the tab host.',
  MealsLibrary: 'Root-stack library drill-in presented above the tab host.',
  ExercisesLibrary: 'Root-stack library drill-in presented above the tab host.',
  WorkoutPresetsLibrary: 'Root-stack library drill-in presented above the tab host.',
  WorkoutPresetDetail: 'Root-stack detail route presented above the tab host.',
  WorkoutPresetForm: 'Root-stack create/edit modal presented above the tab host.',
  MealDetail: 'Root-stack detail route presented above the tab host.',
  FoodDetail: 'Root-stack detail route presented above the tab host.',
  EditBarcode: 'Root-stack settings/detail editor presented above the tab host.',
  ExerciseDetail: 'Root-stack detail route presented above the tab host.',
  FoodEntryAdd: 'Root-stack food-entry modal presented from the tab host.',
  EditLoggedMeal: 'Root-stack diary editor presented above the tab host.',
  FoodEntryView: 'Root-stack diary detail route presented above the tab host.',
  MealTypeDetail: 'Root-stack diary detail route presented above the tab host.',
  FoodForm: 'Root-stack food create/edit modal presented above the tab host.',
  ExerciseForm: 'Root-stack exercise create/edit modal presented above the tab host.',
  FoodScan: 'Root-stack scanner modal presented from the tab host.',
  FoodPhotoIntro: 'Root-stack food-photo modal presented from the tab host.',
  FoodPhotoFlow: 'Root-stack nested food-photo modal with its own native stack.',
  MealAdd: 'Root-stack meal create/edit modal presented above the tab host.',
  ExerciseSearch: 'Root-stack exercise picker modal presented above the tab host.',
  PresetSearch: 'Root-stack preset picker route presented above the tab host.',
  WorkoutAdd: 'Root-stack workout create/edit route presented above the tab host.',
  ActivityAdd: 'Root-stack activity create/edit route presented above the tab host.',
  WorkoutDetail: 'Root-stack workout detail route presented above the tab host.',
  ActivityDetail: 'Root-stack activity detail route presented above the tab host.',
  FastingDetail: 'Root-stack dashboard detail route presented above the tab host.',
  Logs: 'Root-stack settings route presented above the tab host.',
  Sync: 'Root-stack settings route presented above the tab host.',
  MeasurementsAdd: 'Root-stack measurement modal presented from the tab host.',
  CalorieSettings: 'Root-stack settings route presented above the tab host.',
  FoodSettings: 'Root-stack settings route presented above the tab host.',
  DashboardSettings: 'Root-stack settings route presented above the tab host.',
  ServerSettings: 'Root-stack settings route presented above the tab host.',
  AppSettings: 'Root-stack settings route presented above the tab host.',
  About: 'Root-stack settings route presented above the tab host.',
  WhatsNew: 'Root-stack informational route presented above the tab host.',
} satisfies Record<string, string>;

function readMobileFile(relativePath: string): string {
  return fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

function extractTypeKeys(source: string, typeName: string): string[] {
  const match = source.match(
    new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)^\\};`, 'm'),
  );
  if (!match) {
    throw new Error(`Could not find ${typeName} in navigation.ts`);
  }

  return [...match[1].matchAll(/^  ([A-Za-z0-9_]+):/gm)]
    .map((item) => item[1])
    .sort();
}

function extractScreenNames(source: string, navigatorName: string): string[] {
  return [
    ...source.matchAll(
      new RegExp(`<${navigatorName}\\.Screen[\\s\\S]*?name="([^"]+)"`, 'g'),
    ),
  ]
    .map((item) => item[1])
    .sort();
}

function extractDefaultImportPaths(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/^import ([A-Za-z0-9_]+) from '(\.\/src\/screens\/[^']+)';$/gm)]
      .map(([, localName, importPath]) => [
        localName,
        `${importPath.replace(/^\.\//, '')}.tsx`,
      ]),
  );
}

function extractSafeComponentNamesByScreen(source: string): Map<string, string> {
  return new Map(
    [
      ...source.matchAll(
        /^const (Safe[A-Za-z0-9_]+) = withErrorBoundary\(([A-Za-z0-9_]+), '([^']+)'/gm,
      ),
    ].map(([, safeComponent, importedComponent, routeName]) => [
      routeName,
      importedComponent || safeComponent,
    ]),
  );
}

function extractStackComponentsByRoute(source: string): Map<string, string> {
  return new Map(
    [...source.matchAll(/<Stack\.Screen[\s\S]*?name="([^"]+)"[\s\S]*?component=\{([^}]+)\}/g)]
      .map(([, routeName, componentName]) => [routeName, componentName.trim()]),
  );
}

function resolveRootStackScreenFiles(appSource: string): Map<string, string> {
  const importPaths = extractDefaultImportPaths(appSource);
  const safeComponents = extractSafeComponentNamesByScreen(appSource);
  const stackComponents = extractStackComponentsByRoute(appSource);
  const screenFiles = new Map<string, string>();

  for (const [routeName, stackComponent] of stackComponents) {
    const importedComponent = safeComponents.get(routeName) ?? stackComponent;
    const screenFile = importPaths.get(importedComponent);
    if (screenFile) {
      screenFiles.set(routeName, screenFile);
    }
  }

  return screenFiles;
}

function missingFrom(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((item) => !actualSet.has(item));
}

function unexpectedFrom(expected: string[], actual: string[]): string[] {
  const expectedSet = new Set(expected);
  return actual.filter((item) => !expectedSet.has(item));
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(', ') : 'none';
}

function hasNativeHeaderItems(source: string): boolean {
  return /unstable_header(?:Right|Left)Items/.test(source);
}

function hasScreenOwnedHeader(source: string): boolean {
  return (
    source.includes('FormScreenChrome') ||
    /\brenderHeader(?:Bar)?\b/.test(source) ||
    /{\s*\/\*\s*Header\s*\*\/\s*}/.test(source) ||
    /\/\/\s*-+\s*Header\s*-+/.test(source)
  );
}

function extractScreenOwnedHeaderSource(source: string): string {
  const renderHeaderStart = source.search(/\brenderHeader(?:Bar)?\b/);
  const jsxHeaderStart = source.search(/{\s*\/\*\s*Header\s*\*\/\s*}/);
  const commentHeaderStart = source.search(/\/\/\s*-+\s*Header\s*-+/);
  const headerStart =
    renderHeaderStart !== -1
      ? renderHeaderStart
      : jsxHeaderStart !== -1
        ? jsxHeaderStart
        : commentHeaderStart;
  if (headerStart === -1) return '';

  const headerEndCandidates = [
    source.indexOf('\n\n  const render', headerStart + 1),
    source.indexOf('\n\n  // --- Body ---', headerStart + 1),
    source.indexOf('\n\n      {/*', headerStart + 1),
    source.indexOf('\n\n        {/*', headerStart + 1),
    source.indexOf('\n\n      <Keyboard', headerStart + 1),
    source.indexOf('\n\n        <Keyboard', headerStart + 1),
    source.indexOf('\n\n          <Keyboard', headerStart + 1),
    source.indexOf('{/* Body */}', headerStart),
    source.indexOf('// --- Body ---', headerStart),
    source.indexOf('<ScrollView', headerStart),
    source.indexOf('<SectionList', headerStart),
    source.indexOf('<FlatList', headerStart),
  ].filter((index) => index !== -1);
  const headerEnd =
    headerEndCandidates.length > 0 ? Math.min(...headerEndCandidates) : headerStart + 5000;
  return source.slice(headerStart, headerEnd);
}

function hasHeaderActionBeyondNativeBack(source: string): boolean {
  const headerSource = extractScreenOwnedHeaderSource(source);
  if (!headerSource) return false;

  const onPressTargets = [...headerSource.matchAll(/onPress=\{([^}]+)\}/g)]
    .map(([, target]) => target.trim())
    .filter((target) => !target.includes('navigation.goBack'))
    .filter((target) => !target.includes('handleCancel'))
    .filter((target) => !target.includes('setSearchText'))
    .filter((target) => !target.includes('openFoodScan'));

  return onPressTargets.length > 0;
}

function hasNativeBackButton(source: string): boolean {
  const headerSource = extractScreenOwnedHeaderSource(source);
  if (!headerSource) return false;

  if (hasNativeCancelHeaderItem(source)) return false;

  return (
    /name=["']chevron-back["']/.test(headerSource) ||
    /accessibilityLabel=["']Back["']/.test(headerSource)
  );
}

function hasNativeCancelHeaderItem(source: string): boolean {
  return (
    /unstable_headerLeftItems/.test(source) &&
    /label:\s*['"]Cancel['"]/.test(source)
  );
}

function getStackScreenBlock(source: string, routeName: string): string | undefined {
  const routeIndex = source.indexOf(`name="${routeName}"`);
  if (routeIndex === -1) return undefined;

  const start = source.lastIndexOf('<Stack.Screen', routeIndex);
  if (start === -1) return undefined;

  const nextScreen = source.indexOf('\n          <Stack.Screen', routeIndex);
  const navigatorEnd = source.indexOf('\n        </Stack.Navigator>', routeIndex);
  const candidates = [nextScreen, navigatorEnd].filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;

  return source.slice(start, end);
}

function hidesReactHeaderOnIOS(source: string): boolean {
  const formScreenChromeSource = readMobileFile('src/components/FormScreenChrome.tsx');
  return (
    /Platform\.OS\s*!==\s*'ios'\s*&&/.test(source) ||
    /Platform\.OS\s*===\s*'ios'\s*\?\s*null\s*:/.test(source) ||
    (source.includes('FormScreenChrome') &&
      /Platform\.OS\s*!==\s*'ios'\s*&&/.test(formScreenChromeSource))
  );
}

function failNativeHeaderContract(message: string): never {
  throw new Error(
    [
      message,
      '',
      'Native header implementation contract:',
      '- Root stack routes must be declared in RootStackParamList and registered as <Stack.Screen> in App.tsx.',
      '- iOS root-stack screens should use createStackScreenOptions(...) or equivalent explicit iOS native-stack options so the native header is configured in the same place as the route.',
      '- Tab routes must be declared in TabParamList and registered in both NativeTab.Screen and FallbackTab.Screen in TabsLayout.tsx.',
      '- Native iOS tab content must stay wrapped in its tab-local createNativeStackNavigator screen so Dashboard, Diary, Library, and Settings get native headers under the Liquid Glass tab path.',
      '- When adding a new native tab, add the TabParamList entry, the NativeTab.Screen entry, the FallbackTab.Screen entry, and a matching tab-local native stack screen with createIOSNativeHeaderOptions.',
      '- Root-stack screens with a screen-owned React header must use the native iOS stack header in App.tsx through createStackScreenOptions(...) or equivalent explicit iOS options. Do not set headerShown: false for those routes.',
      '- Root-stack screens with a screen-owned React header and a real iOS back button must either set headerBackTitle or use headerBackButtonDisplayMode: \'minimal\' in App.tsx so iOS does not inherit a stale or misleading back-button label. Screens that replace the iOS back button with a native Cancel header item do not need either option.',
      '- Root-stack screens with a screen-owned React header must hide that React header on iOS because the native stack header owns the iOS chrome.',
      '- If a screen-owned React header has custom actions beyond the native back button, mirror those actions with unstable_headerLeftItems or unstable_headerRightItems in the same screen.',
      '- When adding a new root-stack screen that is intentionally presented above Tabs instead of inside native tabs mode, add it to NATIVE_TABS_ROUTE_EXCLUSIONS with a short reason.',
      '- Use patterns like {Platform.OS !== \'ios\' && <Header />} or const renderHeader = () => Platform.OS === \'ios\' ? null : <Header /> for Android-only React headers. Otherwise iOS shows two headers.',
    ].join('\n'),
  );
}

describe('native header navigation contract', () => {
  const navigationSource = readMobileFile('src/types/navigation.ts');
  const appSource = readMobileFile('App.tsx');
  const tabsSource = readMobileFile('src/components/TabsLayout.tsx');

  it('keeps RootStackParamList aligned with App.tsx native-stack screens', () => {
    const rootStackRoutes = extractTypeKeys(navigationSource, 'RootStackParamList');
    const appScreens = extractScreenNames(appSource, 'Stack');

    const missingScreens = missingFrom(rootStackRoutes, appScreens);
    const staleScreens = unexpectedFrom(rootStackRoutes, appScreens);

    if (missingScreens.length > 0 || staleScreens.length > 0) {
      failNativeHeaderContract(
        [
          'RootStackParamList and App.tsx are out of sync.',
          `Routes declared in RootStackParamList but missing from <Stack.Screen>: ${formatList(missingScreens)}.`,
          `Screens registered in App.tsx but missing from RootStackParamList: ${formatList(staleScreens)}.`,
        ].join('\n'),
      );
    }
  });

  it('requires every root-stack screen to have native-tabs coverage or an explicit exclusion reason', () => {
    const rootStackRoutes = extractTypeKeys(navigationSource, 'RootStackParamList');
    const appScreens = extractScreenNames(appSource, 'Stack');
    const nativeTabScreens = extractScreenNames(tabsSource, 'NativeTab');
    const rootStackScreenFiles = resolveRootStackScreenFiles(appSource);
    const rootRoutesWithScreenOwnedHeaders = [...rootStackScreenFiles.entries()]
      .filter(([, screenFile]) => hasScreenOwnedHeader(readMobileFile(screenFile)))
      .map(([route]) => route);
    const nativeTabsModeRoutes = new Set([
      'Tabs',
      ...nativeTabScreens,
      ...rootRoutesWithScreenOwnedHeaders,
    ]);
    const exclusionEntries = Object.entries(NATIVE_TABS_ROUTE_EXCLUSIONS);
    const excludedRoutes = new Set(exclusionEntries.map(([route]) => route));

    const missingNativeTabsRoutes = rootStackRoutes.filter(
      (route) => !nativeTabsModeRoutes.has(route) && !excludedRoutes.has(route),
    );
    const staleExclusions = exclusionEntries
      .map(([route]) => route)
      .filter((route) => !rootStackRoutes.includes(route) && !appScreens.includes(route));
    const emptyReasons = exclusionEntries
      .filter(([, reason]) => reason.trim().length === 0)
      .map(([route]) => route);
    const rootHeaderRoutesWithHiddenNativeHeader = rootRoutesWithScreenOwnedHeaders.filter(
      (route) => {
        const block = getStackScreenBlock(appSource, route);
        return !block || /headerShown:\s*false/.test(block);
      },
    );
    const rootHeaderRoutesMissingBackTitle = rootRoutesWithScreenOwnedHeaders.filter((route) => {
      const screenFile = rootStackScreenFiles.get(route);
      if (!screenFile || !hasNativeBackButton(readMobileFile(screenFile))) {
        return false;
      }

      const block = getStackScreenBlock(appSource, route);
      return (
        !block ||
        (!/headerBackTitle\s*:/.test(block) &&
          !/headerBackButtonDisplayMode\s*:\s*['"]minimal['"]/.test(block))
      );
    });
    const rootHeaderRoutesMissingIOSSuppression = rootRoutesWithScreenOwnedHeaders.filter(
      (route) => {
        const screenFile = rootStackScreenFiles.get(route);
        return !screenFile || !hidesReactHeaderOnIOS(readMobileFile(screenFile));
      },
    );
    const rootHeaderRoutesMissingNativeActions = rootRoutesWithScreenOwnedHeaders.filter(
      (route) => {
        const screenFile = rootStackScreenFiles.get(route);
        if (!screenFile) return false;
        const source = readMobileFile(screenFile);
        return hasHeaderActionBeyondNativeBack(source) && !hasNativeHeaderItems(source);
      },
    );

    if (
      missingNativeTabsRoutes.length > 0 ||
      staleExclusions.length > 0 ||
      emptyReasons.length > 0 ||
      rootHeaderRoutesWithHiddenNativeHeader.length > 0 ||
      rootHeaderRoutesMissingBackTitle.length > 0 ||
      rootHeaderRoutesMissingIOSSuppression.length > 0 ||
      rootHeaderRoutesMissingNativeActions.length > 0
    ) {
      failNativeHeaderContract(
        [
          `Missing native tabs registrations for React Navigation routes: ${formatList(missingNativeTabsRoutes)}.`,
          `Stale native-tabs exclusion entries: ${formatList(staleExclusions)}.`,
          `Native-tabs exclusions missing a reason: ${formatList(emptyReasons)}.`,
          `Root-stack routes with screen-owned headers that hide the native iOS header in App.tsx: ${formatList(rootHeaderRoutesWithHiddenNativeHeader)}.`,
          `Root-stack routes with screen-owned back buttons that are missing headerBackTitle or headerBackButtonDisplayMode: 'minimal' in App.tsx: ${formatList(rootHeaderRoutesMissingBackTitle)}.`,
          `Root-stack routes with screen-owned headers that are not hidden on iOS: ${formatList(rootHeaderRoutesMissingIOSSuppression)}.`,
          `Root-stack routes with custom React header actions but no native header items: ${formatList(rootHeaderRoutesMissingNativeActions)}.`,
        ].join('\n'),
      );
    }
  });

  it('keeps TabParamList aligned with native and fallback tab navigators', () => {
    const tabRoutes = extractTypeKeys(navigationSource, 'TabParamList');
    const nativeTabScreens = extractScreenNames(tabsSource, 'NativeTab');
    const fallbackTabScreens = extractScreenNames(tabsSource, 'FallbackTab');

    const missingNativeTabs = missingFrom(tabRoutes, nativeTabScreens);
    const staleNativeTabs = unexpectedFrom(tabRoutes, nativeTabScreens);
    const missingFallbackTabs = missingFrom(tabRoutes, fallbackTabScreens);
    const staleFallbackTabs = unexpectedFrom(tabRoutes, fallbackTabScreens);

    if (
      missingNativeTabs.length > 0 ||
      staleNativeTabs.length > 0 ||
      missingFallbackTabs.length > 0 ||
      staleFallbackTabs.length > 0
    ) {
      failNativeHeaderContract(
        [
          'TabParamList and TabsLayout.tsx are out of sync.',
          `TabParamList routes missing from NativeTab.Screen: ${formatList(missingNativeTabs)}.`,
          `NativeTab.Screen entries missing from TabParamList: ${formatList(staleNativeTabs)}.`,
          `TabParamList routes missing from FallbackTab.Screen: ${formatList(missingFallbackTabs)}.`,
          `FallbackTab.Screen entries missing from TabParamList: ${formatList(staleFallbackTabs)}.`,
        ].join('\n'),
      );
    }
  });

  it('keeps native iOS tab content inside tab-local native stacks', () => {
    const nonAddTabsMatch = tabsSource.match(
      /export const NON_ADD_TABS = \[([^\]]+)\] as const;/,
    );
    const nonAddTabs = nonAddTabsMatch
      ? [...nonAddTabsMatch[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
      : [];

    const nativeTabScreens = extractScreenNames(tabsSource, 'NativeTab');
    const missingContentTabs = missingFrom(
      nonAddTabs,
      nativeTabScreens.filter((name) => name !== 'Add'),
    );
    const missingStackScreens = nonAddTabs.filter(
      (name) =>
        !new RegExp(`function ${name}StackScreen\\(`).test(tabsSource) ||
        !new RegExp(`${name}Stack\\.Navigator[\\s\\S]*${name}Stack\\.Screen`).test(
          tabsSource,
        ) ||
        !new RegExp(`${name}Stack\\.Screen[\\s\\S]*title: '${name}'`).test(
          tabsSource,
        ),
    );

    if (missingContentTabs.length > 0 || missingStackScreens.length > 0) {
      failNativeHeaderContract(
        [
          'Native iOS tab content is not fully wired through tab-local native stacks.',
          `Content tabs missing from NativeTab.Screen: ${formatList(missingContentTabs)}.`,
          `Content tabs missing a ${'<Tab>'}StackScreen with ${'<Tab>'}Stack.Navigator, ${'<Tab>'}Stack.Screen, and a matching native title: ${formatList(missingStackScreens)}.`,
        ].join('\n'),
      );
    }
  });

  it('hides screen-owned React headers on iOS when native header items are used', () => {
    const rootStackScreenFiles = resolveRootStackScreenFiles(appSource);
    const rootStackScreenFileSet = new Set(rootStackScreenFiles.values());
    const screensWithNativeItemsAndReactHeaders = [...rootStackScreenFileSet]
      .filter((relativePath) => {
        const source = readMobileFile(relativePath);
        return hasNativeHeaderItems(source) && hasScreenOwnedHeader(source);
      })
      .filter((relativePath) => !hidesReactHeaderOnIOS(readMobileFile(relativePath)));
    const unmappedScreensWithNativeItemsAndReactHeaders = fs
      .readdirSync(path.join(mobileRoot, 'src/screens'))
      .filter((fileName) => fileName.endsWith('.tsx'))
      .map((fileName) => `src/screens/${fileName}`)
      .filter((relativePath) => {
        if (rootStackScreenFileSet.has(relativePath)) return false;
        const source = readMobileFile(relativePath);
        return hasNativeHeaderItems(source) && hasScreenOwnedHeader(source);
      });

    if (
      screensWithNativeItemsAndReactHeaders.length > 0 ||
      unmappedScreensWithNativeItemsAndReactHeaders.length > 0
    ) {
      failNativeHeaderContract(
        [
          'Native header items and screen-owned React headers can render at the same time on iOS.',
          `Root-stack screens with native header items and an unsuppressed React header: ${formatList(screensWithNativeItemsAndReactHeaders)}.`,
          `Screens with native header items and a React header that are not mapped from App.tsx root stack screens: ${formatList(unmappedScreensWithNativeItemsAndReactHeaders)}.`,
        ].join('\n'),
      );
    }
  });
});
