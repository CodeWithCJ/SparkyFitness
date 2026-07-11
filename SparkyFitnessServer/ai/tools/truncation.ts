export const CLOUD_CHARACTER_LIMIT = 8_000;
export const LOCAL_CHARACTER_LIMIT = 3_000;
export const CHARACTER_LIMIT = CLOUD_CHARACTER_LIMIT;

export function getCharacterLimit(profile: 'full' | 'core' = 'full'): number {
  return profile === 'core' ? LOCAL_CHARACTER_LIMIT : CLOUD_CHARACTER_LIMIT;
}

/**
 * Truncates text if it exceeds the character limit for the given profile.
 * Appends a warning with a hint for the user to use pagination/filters.
 */
export function truncateIfNeeded(
  text: string,
  hint?: string,
  profile: 'full' | 'core' = 'full'
): string {
  const limit = getCharacterLimit(profile);
  if (text.length <= limit) return text;

  const defaultHint =
    "Use 'limit' and 'offset' parameters to paginate results, or add filters to narrow your search.";
  const truncated = text.slice(0, limit - 200);
  return (
    truncated +
    `\n\n---\n⚠️ Response truncated (exceeded ${limit} characters). ${hint || defaultHint}`
  );
}
