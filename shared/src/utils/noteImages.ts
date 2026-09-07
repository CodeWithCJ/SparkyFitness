/**
 * Resolving photo references inside a note.
 *
 * A note embeds a photo of the food, meal, or diary entry it belongs to. The
 * reference stored in the markdown is just the file's name:
 *
 *   ![photo 1](banana-chips-6.jpg)
 *
 * rather than the full `/uploads/foods/<entity-id>/<file>` path. The directory
 * is entirely derivable from the entity the note hangs off, so repeating it in
 * every reference only puts internal ids into text the user reads and edits.
 *
 * Notes written before this (and any hand-typed absolute path) still carry the
 * full `/uploads/...` form, so both are accepted on read. Only the short form is
 * ever written.
 */

/** Last path segment of a stored image reference. */
export function noteImageName(reference: string): string {
  const trimmed = reference.trim();
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

/**
 * Resolves a markdown image target to one of the entity's stored image paths.
 *
 * `candidates` is the set of paths the note is allowed to reference — the
 * owning food's images, plus a diary entry's own override photos where both
 * apply. Matching by file name is unambiguous within one entity, and a
 * reference that matches nothing resolves to `null` so the caller can show a
 * placeholder instead of a wrong picture.
 *
 * An already-absolute `/uploads/...` target is honoured only if it is one of
 * the candidates; that keeps a note from pointing at another user's upload
 * directory by guessing a path.
 */
export function resolveNoteImage(
  target: string | undefined,
  candidates: readonly string[],
): string | null {
  if (!target) return null;
  const wanted = noteImageName(target);
  if (!wanted) return null;
  return candidates.find((path) => noteImageName(path) === wanted) ?? null;
}
