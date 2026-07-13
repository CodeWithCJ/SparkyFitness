/**
 * Chat tool categories: the user-facing grouping of the chatbot's tool domains.
 *
 * Shared source of truth so the server (which maps each slug to its in-process
 * tool builders) and the frontend (which renders the runtime selector and
 * prefills it from the service's `chat_tool_profile`) cannot drift.
 *
 * The `core` preset maps to exactly the server's historical `core`
 * `chat_tool_profile` (food, exercise, checkin, goals); the full set is every
 * slug. Keep this list ordered to mirror the server builder ordering so the
 * composed tool map — and the Anthropic cache breakpoint on its last tool —
 * stays stable.
 */
export const CHAT_TOOL_CATEGORY_SLUGS = [
  'food',
  'exercise',
  'checkin',
  'goals',
  'reports',
  'coaching',
  'vision',
  'profile',
] as const;

export type ChatToolCategorySlug = (typeof CHAT_TOOL_CATEGORY_SLUGS)[number];

/**
 * Slugs included when the `core` profile/preset is selected. Must stay in sync
 * with the server's `core` tool composition (exercise, food, checkin, goals).
 */
export const CORE_CHAT_TOOL_CATEGORY_SLUGS: readonly ChatToolCategorySlug[] = [
  'food',
  'exercise',
  'checkin',
  'goals',
];

export function isChatToolCategorySlug(
  value: unknown
): value is ChatToolCategorySlug {
  return (
    typeof value === 'string' &&
    (CHAT_TOOL_CATEGORY_SLUGS as readonly string[]).includes(value)
  );
}

/**
 * Normalizes an untrusted category list to the known slugs (order preserved,
 * duplicates removed). Returns `undefined` when nothing valid remains, so
 * callers fall back to the profile default instead of loading zero tools.
 */
export function normalizeChatToolCategories(
  value: unknown
): ChatToolCategorySlug[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<ChatToolCategorySlug>();
  for (const item of value) {
    if (isChatToolCategorySlug(item)) seen.add(item);
  }
  return seen.size > 0 ? Array.from(seen) : undefined;
}
