// Files each automation branch may change, and what their values may contain.
// auto-merge-bot-prs.yml merges these PRs past main's review rule, and
// sync-translations.yml checks its copy against the same rules before opening
// the PR, so the two cannot disagree. The Nix hashes PR is not here: its own
// workflow merges it, pinned to the commit it pushed.
//
// Anyone with write access can push to these branches, so a path outside the
// list means a person must review the PR. English is excluded: it comes from
// developers' PRs, never from the sync.

// English in any spelling (en, EN, en-GB, en_US, eng, english) is excluded: no
// other language code starts with "en", so a case-insensitive prefix covers it.
const LANG = '(?![Ee][Nn])[A-Za-z0-9_+-]+';
const ANDROID_LANG =
  '(?!(?:b\\+)?[Ee][Nn]|(?:car|hdr)(?:[-+/]|$))(?:[a-z]{2,3}(?:-r[A-Z]{2})?|b\\+[a-z]{2,3}(?:\\+[A-Za-z0-9]+)*)';

const ALLOWED_FILES = {
  'i18n/': [
    new RegExp(
      `^SparkyFitnessFrontend/public/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`
    ),
    new RegExp(
      `^SparkyFitnessMobile/src/localization/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`
    ),
    new RegExp(`^SparkyFitnessMobile/locales/${LANG}\\.json$`),
    // Android language qualifiers only (de, pt-rBR, b+yue+Hant), never English
    // and never another qualifier such as night, v31, car or hdr, which would
    // override the English strings in res/values.
    new RegExp(
      `^SparkyFitnessMobile/targets/android-widget/res/values-${ANDROID_LANG}/widget_strings\\.xml$`
    ),
    new RegExp(
      `^SparkyFitnessMobile/targets/widget/${LANG}\\.lproj/Localizable\\.strings$`
    ),
  ],
};

// react-i18next's <Trans> renders a value as markup, and attributes written in
// a value override the props of the component the tag maps to (href, target,
// rel). Values may carry tags such as <0>...</0>, <strong> or <br/>, never
// attributes.
//
// TAG_AT, TAG_NAME and ATTR are the regexes of html-parse-stringify 4.0.1, the
// parser <Trans> uses, so a ">" inside quotes stays part of a tag here as it
// does there. The parser can start a tag at any "<" (it rescans after a tag it
// rejects), so the tag found at every "<" is checked, and readsAttribute copies
// how the parser reads attributes from a tag. That can flag a value the parser
// would read as text, which only holds the PR for review. TAG_WITH_ATTRIBUTES
// also catches an "=" after a tag name the parser would not read as a tag.
const TAG_AT = /<!--[\s\S]*?-->|<[a-zA-Z0-9\-!/](?:"[^"]*"|'[^']*'|[^'">])*>/y;
const TAG_NAME = /<\/?([^\s]+?)[/\s>]/;
const ATTR = /\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?("[^"]*"|'[^']*')/g;
const TAG_WITH_ATTRIBUTES = /<[A-Za-z0-9_-]+[\s/][^>]*=/;

const readsAttribute = (tag) => {
  const name = tag.match(TAG_NAME);
  if (name && name[1].startsWith('!--')) return false; // a comment
  const attr = new RegExp(ATTR);
  for (let m = attr.exec(tag); m !== null; m = attr.exec(tag)) {
    if (m[0].trim() && (m[1] || m[2])) return true;
  }
  return false;
};

// <Trans> parses `<0>${value}</0>`, so a tag left open at the end of a value
// closes on the wrapper's ">". Scan the value as Trans wraps it.
const hasAttributes = (value) => {
  if (TAG_WITH_ATTRIBUTES.test(value)) return true;
  const html = `<0>${value}</0>`;
  for (let i = html.indexOf('<'); i !== -1; i = html.indexOf('<', i + 1)) {
    TAG_AT.lastIndex = i;
    const tag = TAG_AT.exec(html);
    if (tag && readsAttribute(tag[0])) return true;
  }
  return false;
};

// Only the web app renders values with <Trans>. The mobile app has no <Trans>
// (a test fails if one appears) and shows values as plain text, where a
// value such as "(<60 bpm), reflecting" is harmless though the parser would
// read it as a tag.
/** Whether a catalogue's values can reach <Trans>, so must be checked. */
const rendersMarkup = (path) => /^SparkyFitnessFrontend\//.test(path || '');

/** Dotted keys of the string values in a JSON catalogue that put attributes in a tag. */
const valuesWithAttributes = (json) => {
  const found = [];
  const walk = (value, key) => {
    if (typeof value === 'string') {
      if (hasAttributes(value)) found.push(key);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value))
        walk(v, key ? `${key}.${k}` : k);
    }
  };
  walk(JSON.parse(json), '');
  return found;
};

// Links. A translation may repeat the links its English text has, or keep the
// ones it already had on main, but a new link, web address or email holds the
// PR for a maintainer: translated text reaches main without review, and a link
// is how a translation could send users somewhere else.
const COUNTRY_TLDS =
  'ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw';
const GENERIC_TLDS =
  'com net org info biz edu gov mil int app dev page site online store shop xyz top club live link click io ai gg ly me tv cc ws so to pro mobi name tech cloud fun icu vip win bet art blog news email zip mov';
const TLDS = `${GENERIC_TLDS} ${COUNTRY_TLDS}`.split(' ').join('|');
const LINK = new RegExp(
  [
    // A scheme: https://, http://, ftp://, mailto:, javascript:, data:, tel:
    String.raw`\b(?:https?|ftp):\/\/[^\s<>"'\x60]+`,
    String.raw`\b(?:mailto|javascript|data|tel):[^\s<>"'\x60]+`,
    // Protocol-relative //host and www.host
    String.raw`(?:^|[\s(])\/\/[A-Za-z0-9][^\s<>"'\x60]*`,
    String.raw`\bwww\.[^\s<>"'\x60]+`,
    // A bare host with a real top-level domain: example.com, bit.ly/x
    String.raw`\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+(?:${TLDS})\b(?:\/[^\s<>"'\x60]*)?`,
    // An email address
    String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,
  ].join('|'),
  'gi'
);

/** The links in a piece of text, lower-cased and without trailing punctuation. */
const linksIn = (text) =>
  new Set(
    (String(text || '').match(LINK) || []).map((l) =>
      l
        .trim()
        .replace(/[.,;:!?)\]}'"]+$/, '')
        .toLowerCase()
    )
  );

/** Translated strings by key: JSON values, Android <string>s or .strings pairs. */
const entriesOf = (path, text) => {
  const out = new Map();
  if (text === null || text === undefined) return out;
  if (path.endsWith('.json')) {
    const walk = (value, key) => {
      if (typeof value === 'string') out.set(key, value);
      else if (value && typeof value === 'object')
        for (const [k, v] of Object.entries(value))
          walk(v, key ? `${key}.${k}` : k);
    };
    walk(JSON.parse(text), '');
  } else if (path.endsWith('.xml')) {
    const re = /<(string|item)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let i = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const name = /\bname="([^"]*)"/.exec(m[2]);
      out.set(name ? name[1] : `#${i++}`, m[3]);
    }
  } else {
    const re = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
    for (let m = re.exec(text); m; m = re.exec(text)) out.set(m[1], m[2]);
  }
  return out;
};

/** The English catalogue a translated catalogue is translated from. */
const englishPathFor = (path) =>
  path
    .replace(
      /^(SparkyFitnessFrontend\/public\/locales|SparkyFitnessMobile\/src\/localization\/locales)\/[^/]+\//,
      '$1/en/'
    )
    .replace(
      /^SparkyFitnessMobile\/locales\/[^/]+\.json$/,
      'SparkyFitnessMobile/locales/en.json'
    )
    .replace(/\/res\/values-[^/]+\//, '/res/values/')
    .replace(/\/[^/]+\.lproj\//, '/en.lproj/');

/**
 * Links a translated catalogue adds: in a value at `head`, but neither in the
 * English value with the same key nor in the translated value on main. A head
 * that cannot be parsed throws; a missing or unparsable base or English counts
 * as having no links, which only holds more.
 */
const newLinks = (path, headText, baseText, englishText) => {
  const safe = (text, p) => {
    try {
      return entriesOf(p, text);
    } catch {
      return new Map();
    }
  };
  const base = safe(baseText, path);
  const english = safe(englishText, englishPathFor(path));
  const found = [];
  for (const [key, value] of entriesOf(path, headText)) {
    const known = new Set([
      ...linksIn(base.get(key)),
      ...linksIn(english.get(key)),
    ]);
    for (const link of linksIn(value))
      if (!known.has(link)) found.push(`${key}: ${link}`);
  }
  return found;
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

module.exports = {
  ALLOWED_FILES,
  allowedFor,
  englishPathFor,
  linksIn,
  newLinks,
  outsideAllowlist,
  rendersMarkup,
  valuesWithAttributes,
};

// CLI for shell steps. `<branch>` reads paths on stdin, one per line, and prints
// the ones the branch may not change. `--values <file>...` prints the keys of
// web catalogues, given as repo-relative paths, that put attributes in a tag.
// Either exits 1 on any finding.
if (require.main === module && process.argv[2] === '--values') {
  const fs = require('node:fs');
  const found = process.argv
    .slice(3)
    .filter(rendersMarkup)
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
