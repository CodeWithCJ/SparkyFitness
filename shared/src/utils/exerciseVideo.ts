/**
 * Demonstration video links on exercises (`exercises.video_url`). Any http(s)
 * link is accepted; YouTube links get an embed (web) or a thumbnail preview
 * (mobile) because that is what people paste most.
 */

export const EXERCISE_VIDEO_URL_MAX_LENGTH = 2048;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Trims and validates a pasted video link. Returns the cleaned URL, `null` for
 * a blank value (which clears the field), or `undefined` when the text is not
 * an http(s) URL.
 */
export function normalizeExerciseVideoUrl(
  raw: string | null | undefined
): string | null | undefined {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > EXERCISE_VIDEO_URL_MAX_LENGTH) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  if (!url.hostname.includes('.')) return undefined;
  return url.toString();
}

/**
 * The 11-character video id of a YouTube link (watch, youtu.be, shorts, embed,
 * live and music links), or `null` for anything else.
 */
export function parseYouTubeVideoId(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www\.|m\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (
    host === 'youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const [, first, second] = url.pathname.split('/');
    if (first === 'watch') {
      id = url.searchParams.get('v');
    } else if (
      first === 'shorts' ||
      first === 'embed' ||
      first === 'live' ||
      first === 'v'
    ) {
      id = second ?? null;
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Start offset in seconds from a `t=` / `start=` parameter (`90`, `1m30s`). */
function parseYouTubeStartSeconds(url: URL): number | null {
  const value = url.searchParams.get('t') ?? url.searchParams.get('start');
  if (!value) return null;
  if (/^\d+s?$/.test(value)) return parseInt(value, 10);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return null;
  const [, h, m, s] = match;
  const total = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return total > 0 ? total : null;
}

export interface ExerciseVideoInfo {
  /** The link as stored, opened when the person taps the preview. */
  url: string;
  /** Set for YouTube links only. */
  youtubeId: string | null;
  /** Privacy-enhanced embed URL (YouTube only). */
  embedUrl: string | null;
  /** Still image for a tappable preview (YouTube only). */
  thumbnailUrl: string | null;
}

/** Everything a client needs to show an exercise's video, or `null` if none. */
export function getExerciseVideoInfo(
  raw: string | null | undefined
): ExerciseVideoInfo | null {
  const url = normalizeExerciseVideoUrl(raw);
  if (!url) return null;
  const youtubeId = parseYouTubeVideoId(url);
  if (!youtubeId) {
    return { url, youtubeId: null, embedUrl: null, thumbnailUrl: null };
  }
  const start = parseYouTubeStartSeconds(new URL(url));
  return {
    url,
    youtubeId,
    embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0${
      start ? `&start=${start}` : ''
    }`,
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
  };
}
