import foodRepository from '../../models/foodRepository.js';
import { actorUserIdFor } from '../../db/poolManager.js';

// Window for tool-layer exact-name matching over the server's substring
// search. An exact match could fall outside it only when more than this many
// foods contain the searched name as a substring.
export const NAME_RESOLUTION_WINDOW = 500;

// Every food visible to the user whose name equals `name`, ignoring case.
// `mine` limits it to the user's own foods.
export async function findFoodsByExactName(
  userId: string,
  name: string,
  { mine = false }: { mine?: boolean } = {}
) {
  const rows = await foodRepository.getFoodsWithPagination(
    name,
    mine ? 'mine' : null,
    userId,
    NAME_RESOLUTION_WINDOW,
    0,
    null
  );
  return rows.filter(
    (r: { name: unknown }) =>
      String(r.name).toLowerCase() === name.toLowerCase()
  );
}

// Case-insensitive exact name lookup (MCP's `name ILIKE $1` without
// wildcards). Returns the raw catalog row including default_variant.
export async function findFoodByExactName(userId: string, name: string) {
  const matches = await findFoodsByExactName(userId, name);
  // In a family member's account the search also returns the signed-in
  // person's own foods; one of the account owner's wins a tie by name.
  if (actorUserIdFor(userId) !== userId) {
    const owned = matches.find(
      (r: { user_id?: string | null }) => r.user_id === userId
    );
    if (owned) return owned;
  }
  return matches[0];
}

const nameWords = (name: string) =>
  name
    .toLowerCase()
    .split(/[\s\-,;/]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((w) => w.length > 0);

const normalizedName = (name: string) => nameWords(name).join(' ');

// Numbers in any script ("250", "3.5", "250g", "½") say how much, not what.
const isNumber = (w: string) => /^\p{N}/u.test(w);

// The words of a name without numbers: those of three letters or more, or,
// for a name of only shorter words ("Ei 2"), those of two letters or more.
const matchWords = (name: string) => {
  const words = nameWords(name).filter((w) => !isNumber(w));
  const long = words.filter((w) => w.length >= 3);
  return new Set(long.length > 0 ? long : words.filter((w) => w.length >= 2));
};

/**
 * Foods whose name is close to `name`, for when an exact lookup found none.
 * Searches by the first and the longest word of the query, then ranks: a name
 * that is the start of the query (or the query the start of it) first, which
 * catches foods stored with a cut-off name, then by words in common. A
 * result that is not a prefix shares at least two words with the query (one
 * when the query has only one); numbers do not count. `ownOnly` keeps the
 * user's own foods, for actions that can only change those.
 */
export async function findCloseFoodMatches(
  userId: string,
  name: string,
  { limit = 5, ownOnly = false }: { limit?: number; ownOnly?: boolean } = {}
) {
  // Search by the first and the longest word, so a number or a short word
  // such as "ei" does not fill the search window. A query of only numbers
  // names no food.
  const base = [...matchWords(name)];
  if (base.length === 0) return [];
  const longest = base.reduce((a, b) => (b.length > a.length ? b : a));
  const terms = [...new Set([base[0], longest])];
  const seen = new Map<
    string,
    { id: string; name: string; brand?: string | null; user_id?: string }
  >();
  for (const term of terms) {
    const rows = await foodRepository.getFoodsWithPagination(
      term,
      ownOnly ? 'mine' : null,
      userId,
      NAME_RESOLUTION_WINDOW,
      0,
      null
    );
    for (const row of rows) {
      if (ownOnly && row.user_id !== userId) continue;
      if (!seen.has(row.id)) seen.set(row.id, row);
    }
  }
  const query = normalizedName(name);
  const queryWords = matchWords(name);
  const needed = Math.min(2, queryWords.size);
  return [...seen.values()]
    .map((row) => {
      const candidate = normalizedName(String(row.name));
      // Every word of two letters or more on the food's side, so a short
      // query word such as "ei" still finds "Hühner Ei".
      const candidateWords = [
        ...new Set(
          nameWords(String(row.name)).filter(
            (w) => w.length >= 2 && !isNumber(w)
          )
        ),
      ];
      const shared = candidateWords.filter((w) => queryWords.has(w)).length;
      // Same words with other punctuation ("Skyr, natur") count as a prefix.
      // A name of two words or more may also end inside a word
      // ("Kaffeemilch Tagesmen"); one word alone may not, or "Kaffee" would
      // be the start of "Kaffeemilch". The cut word has four letters or
      // more and is no number, so "Milch 3" is not "Milch 3.5".
      const [shorter, longer] =
        candidate.length <= query.length
          ? [candidate, query]
          : [query, candidate];
      const cutWord = shorter.slice(shorter.lastIndexOf(' ') + 1);
      const prefix =
        shorter.length > 0 &&
        (shorter === longer ||
          longer.startsWith(`${shorter} `) ||
          (shorter.includes(' ') &&
            cutWord.length >= 4 &&
            !isNumber(cutWord) &&
            longer.startsWith(shorter)));
      return {
        row,
        prefix,
        shared,
        share: candidateWords.length ? shared / candidateWords.length : 0,
        exact: String(row.name).toLowerCase() === name.toLowerCase(),
      };
    })
    .filter((m) => !m.exact && (m.prefix || m.shared >= needed))
    .sort(
      (a, b) =>
        Number(b.prefix) - Number(a.prefix) ||
        b.shared - a.shared ||
        b.share - a.share ||
        String(a.row.name).length - String(b.row.name).length
    )
    .slice(0, limit)
    .map((m) => m.row);
}

// A name or brand on one line, quoted and escaped, so it cannot add lines or
// food_ids of its own to the list.
const quotedLine = (value: string) =>
  JSON.stringify(
    String(value)
      .replace(/[\s\p{Cc}]+/gu, ' ')
      .trim()
  );

/** One line per close match, with the food_id to pass back. */
export function formatCloseMatches(
  rows: { id: string; name: string; brand?: string | null }[]
) {
  return rows
    .map(
      (r) =>
        `- ${quotedLine(r.name)}${r.brand ? ` (${quotedLine(r.brand)})` : ''}, food_id: ${r.id}`
    )
    .join('\n');
}
