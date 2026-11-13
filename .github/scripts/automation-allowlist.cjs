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
const LANG = "(?![Ee][Nn])[A-Za-z0-9_+-]+";
const ANDROID_LANG =
  "(?!(?:b\\+)?[Ee][Nn]|(?:car|hdr)(?:[-+/]|$))(?:[a-z]{2,3}(?:-r[A-Z]{2})?|b\\+[a-z]{2,3}(?:\\+[A-Za-z0-9]+)*)";

const ALLOWED_FILES = {
  "i18n/": [
    new RegExp(
      `^SparkyFitnessFrontend/public/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`,
    ),
    new RegExp(
      `^SparkyFitnessMobile/src/localization/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`,
    ),
    new RegExp(`^SparkyFitnessMobile/locales/${LANG}\\.json$`),
    new RegExp(`^SparkyFitnessServer/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`),
    new RegExp(`^SparkyFitnessServer/locales/${LANG}/[A-Za-z0-9_-]+\\.json$`),
    // Android language qualifiers only (de, pt-rBR, b+yue+Hant), never English
    // and never another qualifier such as night, v31, car or hdr, which would
    // override the English strings in res/values.
    new RegExp(
      `^SparkyFitnessMobile/targets/android-widget/res/values-${ANDROID_LANG}/widget_strings\\.xml$`,
    ),
    new RegExp(
      `^SparkyFitnessMobile/targets/widget/${LANG}\\.lproj/Localizable\\.strings$`,
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
  if (name && name[1].startsWith("!--")) return false; // a comment
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
  for (let i = html.indexOf("<"); i !== -1; i = html.indexOf("<", i + 1)) {
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
const rendersMarkup = (path) => /^SparkyFitnessFrontend\//.test(path || "");

/** Dotted keys of the string values in a JSON catalogue that put attributes in a tag. */
const valuesWithAttributes = (json) => {
  const found = [];
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (hasAttributes(value)) found.push(key);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value))
        walk(v, key ? `${key}.${k}` : k);
    }
  };
  walk(JSON.parse(json), "");
  return found;
};

/** Whether a catalogue is a server email template catalogue. */
const isServerCatalogue = (path) => /^SparkyFitnessServer\//.test(path || "");

// Server email translations are 100% plain text. The HTML skeleton and link tags
// are built in server code, so server translation strings must contain no HTML tags.
// Matches HTML elements (standard, legacy, or custom elements with attributes),
// declarations, and comments, while allowing plain-text comparisons (e.g. x<y, x<time and y>0).
const HTML_TAG_NAMES =
  "a|abbr|address|applet|area|article|aside|audio|b|base|basefont|bdi|bdo|big|blockquote|body|br|button|canvas|caption|center|cite|code|col|colgroup|data|datalist|dd|del|details|dfn|dialog|dir|div|dl|dt|em|embed|fieldset|figcaption|figure|font|footer|form|frame|frameset|h[1-6]|head|header|hgroup|hr|html|i|iframe|img|input|ins|kbd|label|legend|li|link|main|map|mark|marquee|math|menu|meta|meter|nav|noframes|noscript|object|ol|optgroup|option|output|p|param|picture|portal|pre|progress|q|rp|rt|ruby|s|samp|script|search|section|select|slot|small|source|span|strike|strong|style|sub|summary|sup|table|tbody|td|template|textarea|tfoot|th|thead|time|title|tr|track|tt|u|ul|var|video|wbr|svg|path";
const CUSTOM_ELEMENT_NAME = "[a-zA-Z][a-zA-Z0-9._-]*-[a-zA-Z0-9._-]*";
const BOOLEAN_ATTRS =
  "allowfullscreen|async|autofocus|autoplay|checked|controls|default|defer|disabled|formnovalidate|hidden|inert|ismap|itemscope|loop|multiple|muted|nomodule|novalidate|open|playsinline|readonly|required|reversed|selected";
const TAG_IN_SERVER = new RegExp(
  `<!--[\\s\\S]*?-->|<![a-zA-Z]+(?:\\s+[^>]*)?>|<\\/(?:${HTML_TAG_NAMES}|${CUSTOM_ELEMENT_NAME})\\s*>|<(?:${HTML_TAG_NAMES}|${CUSTOM_ELEMENT_NAME})\\s*\\/?>|<(?:${HTML_TAG_NAMES})\\s+[^>]*(?:=|\\b(?:${BOOLEAN_ATTRS})\\b)[^>]*\\/?>|<${CUSTOM_ELEMENT_NAME}(?:\\s+[^>]*)?\\s*\\/?>`,
  "i",
);

/** Dotted keys of string values in a server JSON catalogue that contain HTML tags. */
const serverValuesWithTags = (json) => {
  const found = [];
  const walk = (value, key) => {
    if (typeof value === "string") {
      if (TAG_IN_SERVER.test(value)) found.push(key);
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value))
        walk(v, key ? `${key}.${k}` : k);
    }
  };
  walk(JSON.parse(json), "");
  return found;
};

// Links. A translation may repeat the links its English text has, or keep the
// ones it already had on main, but a new link, web address or email holds the
// PR for a maintainer: translated text reaches main without review, and a link
// is how a translation could send users somewhere else.
const COUNTRY_TLDS =
  "ac ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bm bn bo br bs bt bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz ec ee eg er es et eu fi fj fk fm fo fr ga gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky kz la lb lc li lk lr ls lt lu lv ly ma mc md me mg mh mk ml mm mn mo mp mq mr ms mt mu mv mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py qa re ro rs ru rw sa sb sc sd se sg sh si sk sl sm sn so sr ss st su sv sx sy sz tc td tf tg th tj tk tl tm tn to tr tt tv tw tz ua ug uk us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw";
const GENERIC_TLDS =
  "com net org info biz edu gov mil int app dev page site online store shop xyz top club live link click io ai gg ly me tv cc ws so to pro mobi name tech cloud fun icu vip win bet art blog news email zip mov";
const TLDS = `${GENERIC_TLDS} ${COUNTRY_TLDS}`.split(" ").join("|");
// Schemes that need no "//": mail, phone and messaging, app stores and deep
// links, script and data URLs.
const BARE_SCHEMES =
  "mailto|tel|callto|sms|smsto|mms|facetime|facetime-audio|sip|sips|skype|whatsapp|tg|viber|geo|maps|market|intent|itms|itms-apps|itms-services|magnet|irc|ircs|xmpp|bitcoin|ethereum|javascript|vbscript|data|blob|file";
// File names such as settings.json or export.csv are not addresses. .zip and
// .mov are real top-level domains, so the listed-domain branch still finds them.
const FILE_EXTENSIONS =
  "json|jsonl|csv|tsv|txt|pdf|png|jpe?g|gif|svg|webp|heic|xml|ya?ml|md|html?|css|tsx?|jsx?|mjs|cjs|py|sql|log|apk|aab|ipa|gpx|fit|tcx|kml|ics|vcf|xlsx?|docx?|db|sqlite|tgz|gz|tar|bak|env|ini|conf|toml|lock|swift|kt|java|strings";
const LINK = new RegExp(
  [
    // Any scheme with "//": https://, sftp://, myapp://
    String.raw`\b[a-z][a-z0-9+.-]{1,31}:\/\/[^\s<>"'\x60]+`,
    String.raw`\b(?:${BARE_SCHEMES}):[^\s<>"'\x60]+`,
    // Protocol-relative //host and www.host
    String.raw`(?:^|[\s(])\/\/[\p{L}\p{N}][^\s<>"'\x60]*`,
    String.raw`\bwww\.[^\s<>"'\x60]+`,
    // A bare host with a listed top-level domain: example.com, bit.ly/x
    String.raw`\b(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+(?:${TLDS})\b(?:\/[^\s<>"'\x60]*)?`,
    // A bare host with any other top-level domain, ASCII (3+ letters, such as
    // example.world) or not (пример.рф). The name before it must have 3+
    // characters, which keeps abbreviations such as f.eks or dr.chen out.
    String.raw`(?<![\p{L}\p{N}._%+@-])(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?\.)*[\p{L}\p{N}][\p{L}\p{N}-]+[\p{L}\p{N}]\.(?!(?:${FILE_EXTENSIONS})(?![\p{L}\p{N}]))(?:[a-z]{3,24}|(?=\P{ASCII})\p{L}{2,24})(?![\p{L}\p{N}])(?:\/[^\s<>"'\x60]*)?`,
    // An email address
    String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,
  ].join("|"),
  "giu",
);

/** The links in a piece of text, lower-cased and without trailing punctuation. */
// Text as a reader sees and would type it: compatibility forms folded
// (full-width letters, ． and ：), invisible format characters such as
// zero-width spaces removed, and ideographic full stops read as dots.
const normalize = (text) =>
  String(text || "")
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    // Chinese, Japanese and Korean run sentences together around 。 and ．,
    // which would read as host names. Blank those scripts out first, so only
    // a Latin, Cyrillic or other address written among them is matched.
    .replace(
      /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Bopomofo}]/gu,
      " ",
    )
    .replace(/[\u3002\uff61]/g, ".");

const linksIn = (text) =>
  new Set(
    (normalize(text).match(LINK) || []).map((l) =>
      l
        .trim()
        .replace(/[.,;:!?)\]}'"]+$/, "")
        .toLowerCase(),
    ),
  );

// Android decodes character references and \u escapes when it compiles string
// resources, and Apple decodes \U and \u in .strings, so a link written as
// https&#x3A;//... or https\u003a//... is checked as the text the app shows.
const fromCode = (hex, dec) => {
  const code = hex !== undefined ? parseInt(hex, 16) : parseInt(dec, 10);
  return Number.isFinite(code) && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "";
};
const decodeXml = (v) =>
  v
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);|&#([0-9]+);/gi, (_, h, d) => fromCode(h, d))
    .replace(
      /&(lt|gt|amp|quot|apos);/g,
      (_, n) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" })[n],
    )
    .replace(/\\u([0-9a-f]{4})/gi, (_, h) => fromCode(h))
    .replace(/\\(.)/g, "$1");
const decodeStrings = (v) =>
  v
    .replace(/\\[Uu]([0-9a-fA-F]{4})/g, (_, h) => fromCode(h))
    .replace(/\\(.)/g, "$1");

// A whole .strings file: entries, comments and whitespace, nothing else.
const STRINGS_TOKEN =
  /\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*|"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/y;

/**
 * Translated strings by key: JSON values, Android <string>s or .strings pairs.
 * Throws when the text is not a whole catalogue of that kind, so a malformed or
 * partly readable file can never hide a value from the checks.
 */
const entriesOf = (path, text) => {
  const out = new Map();
  if (text === null || text === undefined) return out;
  if (path.endsWith(".json")) {
    const decodeReferences = (v) =>
      v
        .replace(/&#x([0-9a-f]+);?/gi, (_, h) => fromCode(h))
        .replace(/&#([0-9]+);?/g, (_, d) => fromCode(undefined, d))
        .replace(
          /&(lt|gt|amp|quot|apos|colon|sol|period|Tab|NewLine);?/gi,
          (_, n) =>
            ({
              lt: "<",
              gt: ">",
              amp: "&",
              quot: '"',
              apos: "'",
              colon: ":",
              sol: "/",
              period: ".",
              tab: "\t",
              newline: "\n",
            })[n.toLowerCase()],
        )
        .replace(
          /\b(href|src|action)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
          (m, attr, dbl, sgl, bare) => {
            const val =
              dbl !== undefined ? dbl : sgl !== undefined ? sgl : bare;
            return `${attr}="${val.replace(/[\t\n\r]/g, "").trim()}"`;
          },
        );
    const walk = (value, key) => {
      if (typeof value === "string") out.set(key, decodeReferences(value));
      else if (value && typeof value === "object")
        for (const [k, v] of Object.entries(value))
          walk(v, key ? `${key}.${k}` : k);
    };
    walk(JSON.parse(text), "");
  } else if (path.endsWith(".xml")) {
    if (!/<resources\b[\s\S]*<\/resources>\s*$/.test(text))
      throw new Error("not an Android resources file");
    const re = /<(string|item)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    let i = 0;
    let parsed = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const name = /\bname="([^"]*)"/.exec(m[2]);
      out.set(name ? name[1] : `#${i++}`, decodeXml(m[3]));
      parsed++;
    }
    if (parsed !== (text.match(/<(?:string|item)\b/g) || []).length)
      throw new Error("a <string> or <item> could not be read");
  } else {
    STRINGS_TOKEN.lastIndex = 0;
    while (STRINGS_TOKEN.lastIndex < text.length) {
      const at = STRINGS_TOKEN.lastIndex;
      const m = STRINGS_TOKEN.exec(text);
      if (!m) throw new Error(`unreadable .strings text at offset ${at}`);
      if (m[1] !== undefined) out.set(decodeStrings(m[1]), decodeStrings(m[2]));
    }
  }
  return out;
};

/** The English catalogue a translated catalogue is translated from. */
const englishPathFor = (path) =>
  path
    .replace(
      /^(SparkyFitnessFrontend\/public\/locales|SparkyFitnessMobile\/src\/localization\/locales|SparkyFitnessServer\/locales)\/[^/]+\//,
      "$1/en/",
    )
    .replace(
      /^SparkyFitnessMobile\/locales\/[^/]+\.json$/,
      "SparkyFitnessMobile/locales/en.json",
    )
    .replace(/\/res\/values-[^/]+\//, "/res/values/")
    .replace(/\/[^/]+\.lproj\//, "/en.lproj/");

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
    (branch || "").startsWith(p),
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
  isServerCatalogue,
  linksIn,
  newLinks,
  outsideAllowlist,
  rendersMarkup,
  serverValuesWithTags,
  valuesWithAttributes,
};

// CLI for shell steps. `<branch>` reads paths on stdin, one per line, and prints
// the ones the branch may not change. `--values <file>...` prints the keys of
// catalogues, given as repo-relative paths, that put attributes in a tag or HTML tags in server catalogues.
// Either exits 1 on any finding.
if (require.main === module && process.argv[2] === "--values") {
  const fs = require("node:fs");
  const found = process.argv
    .slice(3)
    .filter((file) => rendersMarkup(file) || isServerCatalogue(file))
    .flatMap((file) => {
      const text = fs.readFileSync(file, "utf8");
      if (rendersMarkup(file)) {
        return valuesWithAttributes(text).map((key) => `${file}: ${key}`);
      }
      if (isServerCatalogue(file)) {
        return serverValuesWithTags(text).map((key) => `${file}: ${key}`);
      }
      return [];
    });
  if (found.length > 0) {
    console.log(found.join("\n"));
    process.exit(1);
  }
} else if (require.main === module) {
  const branch = process.argv[2];
  const paths = require("node:fs").readFileSync(0, "utf8").split("\n");
  const outside = outsideAllowlist(branch, paths);
  if (outside.length > 0) {
    console.log(outside.join("\n"));
    process.exit(1);
  }
}
