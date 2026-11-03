/**
 * Whether magic link sign-in is turned off.
 * FORCE restores magic links when an admin or DISABLE has turned them off.
 */
export function isMagicLinkLoginDisabled(): boolean {
  return (
    process.env.SPARKY_FITNESS_DISABLE_MAGIC_LINK_LOGIN === 'true' &&
    process.env.SPARKY_FITNESS_FORCE_MAGIC_LINK_LOGIN !== 'true'
  );
}
