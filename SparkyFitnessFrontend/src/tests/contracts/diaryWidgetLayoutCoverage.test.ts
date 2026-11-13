import fs from 'node:fs';
import path from 'node:path';
import {
  buildWidgetKeys,
  generateDefaultLayouts,
  isMealWidgetKey,
  mealWidgetKey,
} from '@/utils/dashboardLayout';

/**
 * The Diary renders whatever is in its widget registry, but react-grid-layout
 * positions a child only if the layout carries an item with the same key. A
 * widget added to the registry and not to generateDefaultLayouts reaches the
 * grid with no tile, gets dropped into a 1x1 cell, and reads to the user as a
 * feature that was never built — which is exactly what happened to the
 * caffeine card between the day it shipped and the day this test was written.
 *
 * The existing dashboardLayout tests could not catch it: they compare
 * buildWidgetKeys against generateDefaultLayouts, and the key was missing from
 * both, so the two agreed on the wrong answer. This one reads the page itself.
 */
describe('Diary widget registry ↔ grid layout coverage', () => {
  const diarySource = fs.readFileSync(
    path.join(__dirname, '..', '..', 'pages', 'Diary', 'Diary.tsx'),
    'utf8'
  );

  // Literal `key: 'energy',` entries in the widget registry. Meal widgets use
  // mealWidgetKey(id) and are covered by the parameterised path instead.
  const registryKeys = [
    ...diarySource.matchAll(/^\s*key: '([a-zA-Z]+)',$/gm),
  ].map((match) => match[1] as string);

  it('finds the registry (guards against the regex silently matching nothing)', () => {
    expect(registryKeys.length).toBeGreaterThanOrEqual(5);
    expect(registryKeys).toContain('energy');
  });

  it('gives every registered widget a tile on every breakpoint', () => {
    const layouts = generateDefaultLayouts([mealWidgetKey('a')]);

    (['lg', 'md', 'sm', 'xs'] as const).forEach((breakpoint) => {
      const placed = new Set(layouts[breakpoint].map((item) => item.i));
      const missing = registryKeys.filter((key) => !placed.has(key));
      expect({ breakpoint, missing }).toEqual({ breakpoint, missing: [] });
    });
  });

  it('keeps buildWidgetKeys in step with the registry', () => {
    const declared = buildWidgetKeys(['a']).filter(
      (key) => !isMealWidgetKey(key)
    );
    expect([...declared].sort()).toEqual([...registryKeys].sort());
  });
});
