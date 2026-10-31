import {
  ACTION_TAG_HOST,
  ACTION_TAG_PATH_PREFIX,
  tagCodeSchema,
} from '../schemas/api/ActionTags.api.zod.ts';

/** The link written on a sticker: the project's tag domain plus the random code. */
export function actionTagUrl(code: string): string {
  return `https://${ACTION_TAG_HOST}${ACTION_TAG_PATH_PREFIX}${code}`;
}

/**
 * The tag code in a scanned or opened link, or null when the link is not one of
 * ours. Only the exact host, an https scheme and a well-formed code count, so a
 * lookalike link can never trigger an action.
 */
export function tagCodeFromUrl(url: string): string | null {
  const match = /^https:\/\/([^/?#]+)(\/[^?#]*)/i.exec(url.trim());
  const host = match?.[1];
  const path = match?.[2];
  if (host === undefined || path === undefined) return null;
  if (host.toLowerCase() !== ACTION_TAG_HOST) return null;
  if (!path.startsWith(ACTION_TAG_PATH_PREFIX)) return null;
  const code = path.slice(ACTION_TAG_PATH_PREFIX.length).replace(/\/$/, '');
  const parsed = tagCodeSchema.safeParse(code);
  return parsed.success ? parsed.data : null;
}
