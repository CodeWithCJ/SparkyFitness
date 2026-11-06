// Files each automation branch may change, and what their values may contain.
// auto-merge-bot-prs.yml merges these PRs past main's review rule, and
// sync-translations.yml checks its copy against the same rules before opening
// the PR, so the two cannot disagree. The Nix hashes PR is not here: its own
// workflow merges it, pinned to the commit it pushed.
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
};

// react-i18next's <Trans> renders a value as markup, and attributes written in
// a value override the props of the component the tag maps to (href, target,
// rel). Values may carry tags such as <0>...</0> or <strong>, never attributes.
const TAG_WITH_ATTRIBUTES = /<[A-Za-z0-9_-]+\s+[^>]*=/;

/** Dotted keys of the string values in a JSON catalogue that put attributes in a tag. */
const valuesWithAttributes = (json) => {
  const found = [];
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (TAG_WITH_ATTRIBUTES.test(value)) found.push(key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value))
        walk(v, key ? `${key}.${k}` : k);
    }
  };
  walk(JSON.parse(json), '');
  return found;
};

/** Lines a unified diff adds that put attributes in a tag. */
const addedLinesWithAttributes = (patch) =>
  (patch || '')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .filter((l) => TAG_WITH_ATTRIBUTES.test(l));

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

module.exports = {
  ALLOWED_FILES,
  allowedFor,
  outsideAllowlist,
  valuesWithAttributes,
  addedLinesWithAttributes,
};

// CLI for shell steps. `<branch>` reads paths on stdin, one per line, and prints
// the ones the branch may not change. `--values <file>...` prints the keys of
// JSON catalogues that put attributes in a tag. Either exits 1 on any finding.
if (require.main === module && process.argv[2] === '--values') {
  const fs = require('node:fs');
  const found = process.argv
    .slice(3)
    .flatMap((file) =>
      valuesWithAttributes(fs.readFileSync(file, 'utf8')).map(
        (key) => `${file}: ${key}`
      )
    );
  if (found.length > 0) {
    console.log(found.join('\n'));
    process.exit(1);
  }
} else if (require.main === module) {
  const branch = process.argv[2];
  const paths = require('node:fs').readFileSync(0, 'utf8').split('\n');
  const outside = outsideAllowlist(branch, paths);
  if (outside.length > 0) {
    console.log(outside.join('\n'));
    process.exit(1);
  }
}
