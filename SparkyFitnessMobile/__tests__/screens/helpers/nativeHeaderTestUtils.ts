import { act, fireEvent } from '@testing-library/react-native';
import { DUPLICATE_PRESS_WINDOW_MS } from '../../../src/utils/duplicatePress';

type HeaderMenuItem = {
  type?: string;
  label?: string;
  state?: 'on' | 'off' | 'mixed';
  onPress?: () => void;
  items?: HeaderMenuItem[];
};

type HeaderItem = {
  label?: string;
  identifier?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  badge?: { value?: number | string };
  menu?: { items: HeaderMenuItem[] };
};

/**
 * On iOS, screen actions like "Save"/"Edit" live in the native stack header,
 * applied via navigation.setOptions({ unstable_headerRightItems / Left }).
 * On Android they are rendered inline. These helpers let a single test assert
 * and interact with the action regardless of which platform Jest is currently
 * emulating (jest-expo runs both the ios and android projects).
 */

/**
 * Header `kind: 'primary'` (Save) actions carry a synchronous duplicate-press
 * guard: two presses inside DUPLICATE_PRESS_WINDOW_MS count as one, which is
 * what stops a burst of taps replayed off a blocked JS thread from writing the
 * same entry several times (#2191).
 *
 * Tests press in immediate succession, compressing to zero what is always
 * seconds of real user time — reading an error toast, fixing a field, then
 * pressing Save again. Call this between two scripted presses of the same
 * action so the guard sees them as the separate deliberate presses they stand
 * for. The guard's own behaviour is covered directly in
 * `__tests__/hooks/useScreenHeaderDuplicatePress.test.tsx`; do not use this to
 * paper over a real double-fire.
 */
let pressClockOffsetMs = 0;

export function skipDuplicatePressWindow(): void {
  pressClockOffsetMs += DUPLICATE_PRESS_WINDOW_MS + 1;
  if (!jest.isMockFunction(Date.now)) {
    const realNow = Date.now.bind(Date);
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + pressClockOffsetMs);
  }
}

// Restored per test so a shifted clock never leaks into a sibling test that
// asserts on dates. Registered here rather than in each importing file so the
// helper cannot be used without its cleanup.
afterEach(() => {
  if (jest.isMockFunction(Date.now)) {
    (Date.now as unknown as jest.SpyInstance).mockRestore();
  }
  pressClockOffsetMs = 0;
});

function collectHeaderItems(navigation: { setOptions?: unknown }): HeaderItem[] {
  const setOptions = navigation?.setOptions as
    | { mock?: { calls: unknown[][] } }
    | undefined;
  const calls = setOptions?.mock?.calls ?? [];
  const items: HeaderItem[] = [];
  for (const call of calls) {
    const options = call?.[0] as
      | {
          unstable_headerRightItems?: () => HeaderItem[];
          unstable_headerLeftItems?: () => HeaderItem[];
        }
      | undefined;
    if (!options) continue;
    for (const factory of [
      options.unstable_headerRightItems,
      options.unstable_headerLeftItems,
    ]) {
      if (typeof factory === 'function') {
        try {
          const produced = factory();
          if (Array.isArray(produced)) items.push(...produced);
        } catch {
          // ignore factories that throw with the current render state
        }
      }
    }
  }
  return items;
}

export function findHeaderItem(
  navigation: { setOptions?: unknown },
  label: string,
): HeaderItem | undefined {
  const items = collectHeaderItems(navigation);
  // Last write wins — return the most recently configured matching item.
  return [...items].reverse().find((item) => item?.label === label);
}

function flattenMenuItems(items: HeaderMenuItem[]): HeaderMenuItem[] {
  return items.flatMap((item) =>
    item.items ? [item, ...flattenMenuItems(item.items)] : [item],
  );
}

/**
 * Find an action inside a native header menu item (type: 'menu'), searching
 * submenus recursively. Returns the most recently configured match.
 */
export function findHeaderMenuAction(
  navigation: { setOptions?: unknown },
  label: string,
): HeaderMenuItem | undefined {
  const items = collectHeaderItems(navigation);
  for (const item of [...items].reverse()) {
    if (!item.menu) continue;
    const match = flattenMenuItems(item.menu.items).find(
      (action) => action.label === label && typeof action.onPress === 'function',
    );
    if (match) return match;
  }
  return undefined;
}

/** Press an action inside a native header menu item, wrapped in act(). */
export function pressHeaderMenuAction(
  navigation: { setOptions?: unknown },
  label: string,
): void {
  const action = findHeaderMenuAction(navigation, label);
  if (!action?.onPress) {
    throw new Error(
      `pressHeaderMenuAction: no native header menu action labelled "${label}" was found`,
    );
  }
  act(() => {
    action.onPress?.();
  });
}

export function findHeaderItemByAccessibilityLabel(
  navigation: { setOptions?: unknown },
  accessibilityLabel: string,
): HeaderItem | undefined {
  const items = collectHeaderItems(navigation);
  return [...items]
    .reverse()
    .find((item) => item?.accessibilityLabel === accessibilityLabel);
}

/**
 * Press the action labelled `label`, whether it is a native header button
 * (iOS) configured through navigation.setOptions, or an inline element
 * (Android) found by visible text.
 */
export function pressAction(
  screen: { queryByText: (text: string) => unknown },
  navigation: { setOptions?: unknown },
  label: string,
): void {
  const headerItem = findHeaderItem(navigation, label);
  if (headerItem?.onPress) {
    // Wrap in act() so state updates triggered by the native header press
    // flush before the next assertion / re-render (fireEvent does this for
    // inline presses automatically, but a direct onPress call does not).
    act(() => {
      headerItem.onPress?.();
    });
    return;
  }
  const inline = screen.queryByText(label);
  if (inline) {
    fireEvent.press(inline as Parameters<typeof fireEvent.press>[0]);
    return;
  }
  throw new Error(
    `pressAction: no native header item or inline element labelled "${label}" was found`,
  );
}

/**
 * Assert the action labelled `label` is present, either as a native header
 * button (iOS) or an inline element (Android).
 */
export function expectActionPresent(
  screen: { queryByText: (text: string) => unknown },
  navigation: { setOptions?: unknown },
  label: string,
): void {
  const headerItem = findHeaderItem(navigation, label);
  const inline = screen.queryByText(label);
  if (!headerItem && !inline) {
    throw new Error(
      `expectActionPresent: action "${label}" not found in native header or inline`,
    );
  }
}

/**
 * Press an icon-only action identified by its accessibility label, whether it
 * is a native header button (iOS) configured through navigation.setOptions, or
 * an inline element (Android) found via getByLabelText.
 */
export function pressActionByAccessibilityLabel(
  screen: { queryByLabelText: (text: string | RegExp) => unknown },
  navigation: { setOptions?: unknown },
  accessibilityLabel: string,
): void {
  const headerItem = findHeaderItemByAccessibilityLabel(
    navigation,
    accessibilityLabel,
  );
  if (headerItem?.onPress) {
    act(() => {
      headerItem.onPress?.();
    });
    return;
  }
  const inline = screen.queryByLabelText(accessibilityLabel);
  if (inline) {
    fireEvent.press(inline as Parameters<typeof fireEvent.press>[0]);
    return;
  }
  throw new Error(
    `pressActionByAccessibilityLabel: no native header item or inline element with accessibility label "${accessibilityLabel}" was found`,
  );
}
