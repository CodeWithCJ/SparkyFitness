import { resolveNoteImage } from '@workspace/shared';

/**
 * Splits note markdown into text runs and the photos embedded between them.
 *
 * Photos are deliberately pulled out of the markdown rather than left for the
 * native renderer, for two reasons:
 *
 * 1. Height. `ENRMImageAttachment` invalidates the text view's layout when an
 *    image finishes downloading but never asks the RN view to re-measure, so
 *    the height handed to Yoga stays whatever it was before the images loaded
 *    and everything past the first one is clipped. Rendering photos as ordinary
 *    RN views makes the container size to its real content.
 * 2. Auth. The library's image downloader issues a plain request with no
 *    headers and exposes no way to add any, so a server behind reverse-proxy
 *    auth could never load them. `SafeImage` sends the same headers as the rest
 *    of the app.
 *
 * A reference that is not one of the entity's own photos is left in the text
 * exactly as written, so an external link still reads the way its author wrote
 * it rather than silently disappearing.
 */

/** Matches a markdown image; the target is resolved separately. */
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

export type NoteSegment =
  | { kind: 'text'; value: string }
  | { kind: 'image'; path: string; alt: string };

export function splitNoteSegments(
  markdown: string | null | undefined,
  candidates: readonly string[] = []
): NoteSegment[] {
  if (!markdown) return [];

  const segments: NoteSegment[] = [];
  let cursor = 0;

  const pushText = (value: string) => {
    if (!value.trim()) return;
    segments.push({ kind: 'text', value });
  };

  for (const match of markdown.matchAll(MARKDOWN_IMAGE)) {
    const [full, alt, target] = match;
    const index = match.index ?? 0;
    // Only a photo of this entity may be rendered; there is deliberately no
    // fallback for an unmatched `/uploads/` path, which would otherwise let a
    // note display an unrelated upload.
    const stored = resolveNoteImage(target, candidates);

    // Not one of this entity's photos — leave it in the text untouched.
    if (!stored) continue;

    pushText(markdown.slice(cursor, index));
    segments.push({ kind: 'image', path: stored, alt });
    cursor = index + full.length;
  }

  pushText(markdown.slice(cursor));
  return segments;
}
