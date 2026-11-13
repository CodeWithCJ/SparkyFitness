import { StyleSheet } from 'react-native';
import type { screen } from '@testing-library/react-native';

type TestElement = ReturnType<typeof screen.getByText>;

/**
 * The padding the nearest ancestor of `element` sets on `side`. Walks up
 * rather than assuming a depth: uniwind wraps styled Views, so the padded
 * container is not the immediate parent.
 */
export function paddingAbove(
  element: TestElement,
  side: 'paddingTop' | 'paddingBottom'
): number | undefined {
  let node = element.parent;
  while (node) {
    const value = StyleSheet.flatten(node.props.style)?.[side];
    if (typeof value === 'number') return value;
    node = node.parent;
  }
  return undefined;
}
