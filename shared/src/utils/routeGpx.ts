import type { RoutePoint } from '../schemas/api/Route.api.zod.ts';

const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';

const escapeText = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The file with its comments removed and each CDATA section turned into
 * escaped text, in one left-to-right pass. Neither can hold a point: markup in
 * a comment is ignored and markup in CDATA is data. An unclosed comment runs to
 * the end; an unclosed CDATA section is taken as text to the end. Every search
 * resumes where the last one stopped, so the cost is linear in the file.
 */
function flattenCommentsAndCdata(text: string): string {
  let out = '';
  let from = 0;
  let comment = -1;
  let cdata = -1;
  for (;;) {
    if (comment !== -2 && comment < from) {
      const found = text.indexOf(COMMENT_OPEN, from);
      comment = found === -1 ? -2 : found;
    }
    if (cdata !== -2 && cdata < from) {
      const found = text.indexOf(CDATA_OPEN, from);
      cdata = found === -1 ? -2 : found;
    }
    if (comment === -2 && cdata === -2) break;
    if (cdata === -2 || (comment !== -2 && comment < cdata)) {
      out += text.slice(from, comment);
      const close = text.indexOf(COMMENT_CLOSE, comment + COMMENT_OPEN.length);
      if (close === -1) return out;
      from = close + COMMENT_CLOSE.length;
    } else {
      out += text.slice(from, cdata);
      const bodyStart = cdata + CDATA_OPEN.length;
      const close = text.indexOf(CDATA_CLOSE, bodyStart);
      if (close === -1) return out + escapeText(text.slice(bodyStart));
      out += escapeText(text.slice(bodyStart, close));
      from = close + CDATA_CLOSE.length;
    }
  }
  return out + text.slice(from);
}

/**
 * Whether a code point may appear in an XML 1.0 document: tab, line feed,
 * carriage return, and the ranges above the control characters, minus the
 * surrogate block and the two non-characters at the top of the BMP.
 */
const isXml10Char = (code: number): boolean =>
  code === 0x9 ||
  code === 0xa ||
  code === 0xd ||
  (code >= 0x20 && code <= 0xd7ff) ||
  (code >= 0xe000 && code <= 0xfffd) ||
  (code >= 0x10000 && code <= 0x10ffff);

const NAMED_ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
};

/**
 * Text with its entities decoded in one pass, so `&amp;lt;` is `&lt;` and not
 * `<`. Numeric references are read too; one that is not a character XML 1.0
 * allows is dropped.
 */
const decodeXml = (text: string): string =>
  text
    .replace(
      /&(?:(lt|gt|quot|apos|amp)|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g,
      (_match, named?: string, decimal?: string, hex?: string) => {
        if (named !== undefined) return NAMED_ENTITIES[named] as string;
        const code =
          decimal !== undefined ? Number(decimal) : parseInt(hex as string, 16);
        return isXml10Char(code) ? String.fromCodePoint(code) : '';
      }
    )
    .trim();

/** The text without the characters XML 1.0 cannot carry (a name may hold any). */
const stripXmlForbidden = (text: string): string => {
  let out = '';
  for (const char of text) {
    if (isXml10Char(char.codePointAt(0) as number)) out += char;
  }
  return out;
};

const escapeXml = (text: string): string =>
  stripXmlForbidden(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A plain decimal such as `-12.5`: no hex, exponent, `Infinity` or blanks. */
const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

const parseDecimal = (text: string): number | null =>
  DECIMAL.test(text) ? Number(text) : null;

/** The number in an attribute of a tag, matched only as a whole attribute name. */
function attribute(attributes: string, name: string): number | null {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`
  ).exec(attributes);
  const value = match?.[1] ?? match?.[2];
  return value === undefined ? null : parseDecimal(value.trim());
}

export interface ParsedGpx {
  name: string | null;
  points: RoutePoint[];
}

const isNameChar = (c: string | undefined): boolean =>
  c !== undefined && /[A-Za-z0-9_]/.test(c);

/** The index of the next `<tag` that is the whole tag name, or -1. */
function findOpenTag(text: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let at = text.indexOf(needle, from);
  while (at !== -1 && isNameChar(text[at + needle.length])) {
    at = text.indexOf(needle, at + needle.length);
  }
  return at;
}

/** The text of the first `<name>` after `from`, or null. */
function nameAfter(text: string, from: number): string | null {
  const open = text.indexOf('<name>', from);
  if (open === -1) return null;
  const close = text.indexOf('</name>', open + 6);
  return close === -1 ? null : text.slice(open + 6, close);
}

/** The altitude in a point's first well-formed `<ele>`, or null when it is out of range. */
function elevation(body: string): number | null {
  let from = 0;
  for (;;) {
    const open = body.indexOf('<ele>', from);
    if (open === -1) return null;
    const close = body.indexOf('</ele>', open + 5);
    if (close === -1) return null;
    from = open + 5;
    // A number is short; anything longer is not one. Only an opener within a
    // few characters of this closer can still be one, so skip straight there
    // instead of re-scanning to the same closer from every opener before it.
    if (close - from > 40) {
      from = Math.max(from, close - 45);
      continue;
    }
    const text = body.slice(from, close).trim();
    if (text.length === 0 || /\s/.test(text) || text.includes('<')) continue;
    // The first well-formed element decides, in range or not.
    const alt = parseDecimal(text);
    return alt !== null && alt >= -1000 && alt <= 10000 ? alt : null;
  }
}

/**
 * Reads the track (`trkpt`) or, failing that, route (`rtept`) points from a
 * GPX file. Points with a missing or out-of-range position are dropped.
 * Deliberately tolerant and dependency-free; it is not a general XML parser.
 * It is a single left-to-right scan with `indexOf`, never a backtracking
 * expression, so a hostile or malformed file (thousands of unclosed tags, say)
 * costs time in proportion to its size.
 */
export function parseGpx(source: string): ParsedGpx {
  // Point-shaped text in a comment or a CDATA section is not a point.
  const gpx = flattenCommentsAndCdata(source);
  const tracks: RoutePoint[] = [];
  const routes: RoutePoint[] = [];
  const rest: string[] = []; // the text between points, for the name lookup
  // The next closing tag per point tag, found once and reused; -2 = none left.
  const closers: Record<string, number> = { trkpt: -1, rtept: -1 };
  // The next opening tag per point tag, found once and reused; -2 = none left.
  const opens: Record<string, number> = { trkpt: -1, rtept: -1 };
  let cursor = 0;
  let copied = 0;
  // The next `>` at or after the scan point, found once and reused; -2 = none left.
  let tagEndAt = -1;
  const nextOpen = (tag: 'trkpt' | 'rtept'): number => {
    if (opens[tag] === -2) return -1;
    if ((opens[tag] as number) < cursor) {
      const found = findOpenTag(gpx, tag, cursor);
      opens[tag] = found === -1 ? -2 : found;
    }
    return opens[tag] === -2 ? -1 : (opens[tag] as number);
  };

  while (cursor < gpx.length) {
    const track = nextOpen('trkpt');
    const route = nextOpen('rtept');
    let start: number;
    let tag: 'trkpt' | 'rtept';
    if (track === -1 && route === -1) break;
    if (route === -1 || (track !== -1 && track < route)) {
      start = track;
      tag = 'trkpt';
    } else {
      start = route;
      tag = 'rtept';
    }
    const attributesStart = start + 1 + tag.length;
    // The next `>`, found once and reused while it is still ahead.
    if (tagEndAt !== -2 && tagEndAt < attributesStart) {
      const found = gpx.indexOf('>', attributesStart);
      tagEndAt = found === -1 ? -2 : found;
    }
    if (tagEndAt === -2) break;
    const tagEnd = tagEndAt;
    const selfClosing = gpx[tagEnd - 1] === '/';
    const attributes = gpx.slice(
      attributesStart,
      selfClosing ? tagEnd - 1 : tagEnd
    );
    let end = tagEnd + 1;
    let body = '';
    if (!selfClosing) {
      const closing = `</${tag}>`;
      if (closers[tag] !== -2 && (closers[tag] as number) < end) {
        const found = gpx.indexOf(closing, end);
        closers[tag] = found === -1 ? -2 : found;
      }
      const closeAt = closers[tag] as number;
      if (closeAt === -2) {
        // No closing tag anywhere after this: not a point. Keep scanning.
        cursor = attributesStart;
        continue;
      }
      body = gpx.slice(end, closeAt);
      end = closeAt + closing.length;
    }
    rest.push(gpx.slice(copied, start));
    copied = end;
    cursor = end;

    const lat = attribute(attributes, 'lat');
    const lon = attribute(attributes, 'lon');
    if (lat === null || lon === null) continue;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
    const point: RoutePoint = { lat, lon };
    const alt = elevation(body);
    if (alt !== null) point.alt = alt;
    (tag === 'trkpt' ? tracks : routes).push(point);
  }
  rest.push(gpx.slice(copied));
  const nameSource = rest.join('');

  const nameOf = (tag: string): string | null => {
    const at = findOpenTag(nameSource, tag, 0);
    return at === -1 ? null : nameAfter(nameSource, at);
  };
  const rawName = nameOf('trk') ?? nameOf('rte') ?? nameOf('metadata');
  const name = rawName ? decodeXml(rawName) : '';

  return {
    name: name.length > 0 ? name : null,
    points: tracks.length > 0 ? tracks : routes,
  };
}

/** A GPX 1.1 file with one track of one segment. */
export function serializeGpx(
  name: string,
  points: readonly RoutePoint[]
): string {
  const body = points
    .map((p) => {
      const ele = p.alt === undefined ? '' : `<ele>${p.alt}</ele>`;
      return `      <trkpt lat="${p.lat}" lon="${p.lon}">${ele}</trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SparkyFitness" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
}
