/**
 * A single slot in the image picker: either an image already saved on the
 * server, or a file staged in the browser that has not been uploaded yet.
 *
 * Both kinds live in one ordered list so the user can drag a newly added photo
 * ahead of a saved one; the split back into "order" and "files" only happens at
 * save time.
 */
export type PickerImage =
  | { kind: 'saved'; path: string }
  | { kind: 'new'; file: File; id: string };

let newImageCounter = 0;

/** Wraps a File for the picker, with a stable id for React keys. */
export function toNewImage(file: File): PickerImage {
  newImageCounter += 1;
  return { kind: 'new', file, id: `new-${newImageCounter}` };
}

/** Wraps already-saved image paths for the picker. */
export function toSavedImages(
  paths: string[] | null | undefined
): PickerImage[] {
  if (!Array.isArray(paths)) {
    return [];
  }
  return paths
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .map((path) => ({ kind: 'saved', path }));
}

/**
 * Splits the picker list into what the API needs: the desired final order with
 * `__new__<n>` placeholders standing in for uploads, and the files themselves
 * in matching index order. The server substitutes each placeholder for the
 * corresponding upload, which is what preserves a user's chosen order.
 */
export function splitPickerImages(items: PickerImage[]): {
  order: string[];
  files: File[];
} {
  const order: string[] = [];
  const files: File[] = [];

  for (const item of items) {
    if (item.kind === 'saved') {
      order.push(item.path);
    } else {
      order.push(`__new__${files.length}`);
      files.push(item.file);
    }
  }

  return { order, files };
}

/** True when the list differs from the saved paths it started from. */
export function pickerImagesDiffer(
  items: PickerImage[],
  savedPaths: string[] | null | undefined
): boolean {
  const saved = Array.isArray(savedPaths) ? savedPaths : [];
  if (items.some((item) => item.kind === 'new')) {
    return true;
  }
  const current = items.map((item) => (item.kind === 'saved' ? item.path : ''));
  return (
    current.length !== saved.length ||
    current.some((path, index) => path !== saved[index])
  );
}

/** Moves an item within the list, returning a new array. */
export function reorderPickerImages(
  items: PickerImage[],
  from: number,
  to: number
): PickerImage[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (!moved) {
    return items;
  }
  next.splice(to, 0, moved);
  return next;
}
