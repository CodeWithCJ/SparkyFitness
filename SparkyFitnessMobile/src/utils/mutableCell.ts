/**
 * A mutable value that never drives rendering, for flags and callbacks that
 * async handlers share (an upload-in-progress marker, a "close when settled"
 * callback). Hold it with `useState(() => createCell(initial))[0]`.
 *
 * Unlike a `useRef`, reading it inside a callback that is handed to a
 * render-phase API (action sheet items, header items) is not a ref read during
 * render: `get` and `set` are only ever called from handlers.
 */
export interface MutableCell<T> {
  get: () => T;
  set: (next: T) => void;
}

export const createCell = <T>(initial: T): MutableCell<T> => {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
  };
};
