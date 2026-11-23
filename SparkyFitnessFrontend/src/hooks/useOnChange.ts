import { useState } from 'react';

const UNSET = Symbol('unset');

const sameDeps = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

/**
 * Runs `onChange` during render on the first render and whenever one of
 * `deps` changes. Use it to reset or re-seed local state from props, instead
 * of calling setState in an effect (which paints one stale frame first).
 * `onChange` should only call state setters.
 */
export function useOnChange(deps: readonly unknown[], onChange: () => void) {
  const [prev, setPrev] = useState<readonly unknown[] | typeof UNSET>(UNSET);
  if (prev === UNSET || !sameDeps(prev, deps)) {
    setPrev(deps);
    onChange();
  }
}
