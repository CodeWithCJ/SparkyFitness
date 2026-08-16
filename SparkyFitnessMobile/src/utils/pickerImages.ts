/**
 * Client-side model for the server's image ordering protocol, mirroring web's
 * `SparkyFitnessFrontend/src/utils/imagePickerItems.ts`.
 *
 * The server (`middleware/imageUpload.ts`) takes an `images` field holding the
 * desired final order: existing images appear as their stored path, and each
 * newly uploaded file is referenced by `__new__<n>` where n is its index among
 * the appended files. Anything omitted from that array is deleted server-side,
 * and index 0 is the thumbnail.
 */

/** Matches the server's MAX_IMAGE_COUNT. */
export const MAX_IMAGES = 10;

/**
 * Wire form of a picker's contents: the ordered `images` array (with
 * `__new__<n>` placeholders) plus the local files those placeholders name.
 */
export type ImageUploadArgs = { order: string[]; newUris: string[] };

export type SavedPickerImage = { kind: 'saved'; path: string };
export type NewPickerImage = { kind: 'new'; uri: string; id: string };
export type PickerImage = SavedPickerImage | NewPickerImage;

let newImageCounter = 0;

/** Wraps a freshly picked local URI as an unsaved picker item. */
export function toNewImage(uri: string): PickerImage {
  newImageCounter += 1;
  return { kind: 'new', uri, id: `new-${newImageCounter}` };
}

/** Seeds the picker from an entity's stored image array. */
export function toSavedImages(
  images: string[] | null | undefined,
): SavedPickerImage[] {
  if (!Array.isArray(images)) return [];
  return images
    .map((image) => image?.trim())
    .filter((image): image is string => !!image && image !== '[]')
    .map((path) => ({ kind: 'saved', path }));
}

/**
 * Splits picker state into the wire representation: the ordered `images` array
 * (with `__new__<n>` placeholders) and the parallel list of URIs to upload.
 */
export function splitPickerImages(items: PickerImage[]): ImageUploadArgs {
  const order: string[] = [];
  const newUris: string[] = [];

  for (const item of items.slice(0, MAX_IMAGES)) {
    if (item.kind === 'saved') {
      order.push(item.path);
    } else {
      order.push(`__new__${newUris.length}`);
      newUris.push(item.uri);
    }
  }

  return { order, newUris };
}

/**
 * Whether the picker differs from what is stored, so a caller can skip an
 * upload round-trip when nothing changed. Order matters: promoting an image to
 * index 0 changes the thumbnail without adding or removing anything.
 */
export function pickerImagesDiffer(
  items: PickerImage[],
  stored: string[] | null | undefined,
): boolean {
  if (items.some((item) => item.kind === 'new')) return true;

  const current = items.flatMap((item) =>
    item.kind === 'saved' ? [item.path] : [],
  );
  const previous = toSavedImages(stored).map((item) => item.path);

  if (current.length !== previous.length) return true;
  return current.some((path, index) => path !== previous[index]);
}

/** Moves an image to index 0, making it the thumbnail. Order is otherwise kept. */
export function setAsMain(
  items: PickerImage[],
  index: number,
): PickerImage[] {
  if (index <= 0 || index >= items.length) return items;
  const next = [...items];
  const [promoted] = next.splice(index, 1);
  next.unshift(promoted);
  return next;
}

/** Removes the image at `index`. */
export function removeImageAt(
  items: PickerImage[],
  index: number,
): PickerImage[] {
  if (index < 0 || index >= items.length) return items;
  return items.filter((_, i) => i !== index);
}

/** Identity for React list keys. */
export function pickerImageKey(item: PickerImage): string {
  return item.kind === 'saved' ? `saved:${item.path}` : item.id;
}
