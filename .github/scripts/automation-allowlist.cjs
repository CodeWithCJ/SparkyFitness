// Files each automation branch may change. auto-merge-bot-prs.yml merges these
// PRs past main's review rule, and sync-translations.yml checks its copy against
// the same list before opening the PR, so the two cannot disagree.
//
// Anyone with write access can push to these branches, so a path outside the
// list means a person must review the PR. English is excluded: it comes from
// developers' PRs, never from the sync.

const LANG = '(?!en(?:[/.]|$))[A-Za-z0-9_+-]+';

const ALLOWED_FILES = {
  'i18n/': [
    new RegExp(
      `^SparkyFitnessFrontend/public/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`
    ),
    new RegExp(
      `^SparkyFitnessMobile/src/localization/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`
    ),
    new RegExp(`^SparkyFitnessMobile/locales/${LANG}\\.json$`),
    /^SparkyFitnessMobile\/targets\/android-widget\/res\/values-[A-Za-z0-9_+-]+\/widget_strings\.xml$/,
    new RegExp(
      `^SparkyFitnessMobile/targets/widget/${LANG}\\.lproj/Localizable\\.strings$`
    ),
  ],
  'nix/': [/^nix\/[A-Za-z0-9_-]+\.nix$/],
};

/** The allowlist for a branch, or null when the branch is not an automation branch. */
const allowedFor = (branch) => {
  const prefix = Object.keys(ALLOWED_FILES).find((p) =>
    (branch || '').startsWith(p)
  );
  return prefix ? ALLOWED_FILES[prefix] : null;
};

/** The paths a branch may not change. Every path when the branch has no allowlist. */
const outsideAllowlist = (branch, paths) => {
  const allowed = allowedFor(branch);
  const named = (paths || []).filter(Boolean);
  return allowed
    ? named.filter((p) => !allowed.some((re) => re.test(p)))
    : named;
};

module.exports = { ALLOWED_FILES, allowedFor, outsideAllowlist };

// CLI for shell steps: paths on stdin, one per line. Prints the paths the branch
// may not change and exits 1 if there are any.
if (require.main === module) {
  const branch = process.argv[2];
  const paths = require('node:fs').readFileSync(0, 'utf8').split('\n');
  const outside = outsideAllowlist(branch, paths);
  if (outside.length > 0) {
    console.log(outside.join('\n'));
    process.exit(1);
  }
}
