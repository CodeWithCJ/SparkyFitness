import { act, fireEvent } from '@testing-library/react-native';

type HeaderItem = {
  label?: string;
  identifier?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
};

/**
 * On iOS, screen actions like "Save"/"Edit" live in the native stack header,
 * applied via navigation.setOptions({ unstable_headerRightItems / Left }).
 * On Android they are rendered inline. These helpers let a single test assert
 * and interact with the action regardless of which platform Jest is currently
 * emulating (jest-expo runs both the ios and android projects).
 */

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

function findHeaderItemByAccessibilityLabel(
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
