const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join, relative, resolve } = require("node:path");
const { test } = require("node:test");
const {
  allowedFor,
  englishPathFor,
  isServerCatalogue,
  linksIn,
  newLinks,
  outsideAllowlist,
  rendersMarkup,
  serverValuesWithTags,
  valuesWithAttributes,
} = require("./automation-allowlist.cjs");
const { readFileSync } = require("node:fs");

const root = resolve(__dirname, "../..");
const tracked = (...specs) =>
  execFileSync("git", ["ls-files", "--", ...specs], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);

const catalogues = tracked(
  "SparkyFitnessFrontend/public/locales",
  "SparkyFitnessMobile/src/localization/locales",
  "SparkyFitnessMobile/locales",
  "SparkyFitnessMobile/targets/android-widget/res/values-*/widget_strings.xml",
  "SparkyFitnessMobile/targets/widget/*.lproj/Localizable.strings",
  "SparkyFitnessServer/locales",
);
const isEnglish = (p) =>
  /\/locales\/en\/|\/locales\/en\.json$|\/en\.lproj\/|\/res\/values\//.test(p);

test("every non-English catalogue in the repo is allowed on i18n/ branches", () => {
  const nonEnglish = catalogues.filter((p) => !isEnglish(p));
  assert.ok(
    nonEnglish.length > 50,
    "expected the real locale files to be found",
  );
  assert.deepEqual(
    outsideAllowlist("i18n/sync-weblate-translations", nonEnglish),
    [],
  );
});

test("English catalogues are never allowed", () => {
  const english = catalogues.filter(isEnglish);
  assert.ok(english.length > 0);
  assert.deepEqual(
    outsideAllowlist("i18n/sync-weblate-translations", english),
    english,
  );
});

test("code, workflows, nested and non-catalogue files are rejected", () => {
  const bad = [
    "SparkyFitnessFrontend/src/App.tsx",
    ".github/workflows/sync-translations.yml",
    "package.json",
    "SparkyFitnessFrontend/public/locales/de/evil.html",
    "SparkyFitnessFrontend/public/locales/de/.prettierrc.cjs",
    "SparkyFitnessFrontend/public/locales/fr/cache/note.json",
    "SparkyFitnessMobile/targets/widget/de.lproj/Controls.swift",
    "nix/update-hashes.sh",
    "SparkyFitnessMobile/targets/android-widget/res/values-en/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-en-rGB/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-b+en+US/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-night/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-v31/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-car/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-de-night/widget_strings.xml",
    "SparkyFitnessMobile/targets/android-widget/res/values-eng/widget_strings.xml",
    "SparkyFitnessMobile/targets/widget/en-GB.lproj/Localizable.strings",
    "SparkyFitnessMobile/targets/widget/EN.lproj/Localizable.strings",
    "SparkyFitnessFrontend/public/locales/en-GB/translation.json",
    "SparkyFitnessMobile/src/localization/locales/en_US/translation.json",
    "SparkyFitnessMobile/locales/english.json",
    "SparkyFitnessServer/locales/en-US/translation.json",
  ];
  assert.deepEqual(
    outsideAllowlist("i18n/sync-weblate-translations", bad),
    bad,
  );
});

test("nix/ branches are not auto-merged: their workflow merges its own PR", () => {
  assert.equal(allowedFor("nix/update-pnpm-hashes"), null);
  assert.deepEqual(
    outsideAllowlist("nix/update-pnpm-hashes", ["nix/backend.nix"]),
    ["nix/backend.nix"],
  );
});

test("no web catalogue in the repo puts attributes in a tag", () => {
  const json = catalogues.filter(
    (p) => p.endsWith(".json") && rendersMarkup(p),
  );
  assert.ok(json.length > 20, "expected the web catalogues to be found");
  const found = json.flatMap((p) =>
    valuesWithAttributes(readFileSync(resolve(root, p), "utf8")).map(
      (k) => `${p}: ${k}`,
    ),
  );
  assert.deepEqual(found, []);
});

test("no server email catalogue in the repo contains HTML tags", () => {
  const json = catalogues.filter(
    (p) => p.endsWith(".json") && isServerCatalogue(p),
  );
  assert.ok(json.length > 0, "expected server catalogues to be found");
  const found = json.flatMap((p) =>
    serverValuesWithTags(readFileSync(resolve(root, p), "utf8")).map(
      (k) => `${p}: ${k}`,
    ),
  );
  assert.deepEqual(found, []);
});

test("server email templates must be plain text without HTML tags", () => {
  const valid = JSON.stringify({
    reset: "You have requested a password reset for your account.",
    mfa: "Your code is {{code}}.",
    magic: "Please click on the link to log in.",
    expiry: "This link will expire in {{expiresInMinutes}} minutes.",
    comparison:
      "Thresholds: x<y and duration < 5 minutes and x<y and z> and x<y and z=1>.",
    comparisonTime: "x<time and y>0",
    spacedComparisonTime: "x <time and y>0",
  });
  assert.deepEqual(serverValuesWithTags(valid), []);

  const invalid = JSON.stringify({
    link: '<a href="https://evil.com">Reset</a>',
    tag: "<p>Hello</p>",
    adjacentTag: "Hello<p>World",
    adjacentTagWithAttr: "Hello<img src=x>",
    paramTag: "<param name=x>",
    mathTag: "<math>",
    legacyTag: "<font color=red>Font</font>",
    customTag: "<custom-element>Custom</custom-element>",
    customUnderscore: "<my-widget_name>Warning</my-widget_name>",
    bareAttr: "<custom-element active>",
    booleanAttr: "<input disabled>",
    compactSelfClosing: "Line<br/>break",
    compactComment: "<!--comment-->",
    script: "<script>alert(1)</script>",
    img: '<img src="https://tracker.com">',
    comment: "<!-- comment -->",
    email: {
      reset: '<a href="https://evil.com">Nested reset</a>',
      safe: "Safe text",
    },
    validText: "Regular text without tags",
  });
  assert.deepEqual(serverValuesWithTags(invalid), [
    "link",
    "tag",
    "adjacentTag",
    "adjacentTagWithAttr",
    "paramTag",
    "mathTag",
    "legacyTag",
    "customTag",
    "customUnderscore",
    "bareAttr",
    "booleanAttr",
    "compactSelfClosing",
    "compactComment",
    "script",
    "img",
    "comment",
    "email.reset",
  ]);

  // CLI test: passing a server catalogue with tags through --values exits 1 and prints the offending key
  const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
  const tempDir = mkdtempSync(
    resolve(root, "SparkyFitnessServer/.tmp-allowlist-test-"),
  );
  const tempTestFile = join(tempDir, "catalogue.json");
  const relPath = relative(root, tempTestFile).replace(/\\/g, "/");
  try {
    writeFileSync(tempTestFile, invalid, "utf8");
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [resolve(__dirname, "automation-allowlist.cjs"), "--values", relPath],
          { cwd: root, encoding: "utf8" },
        ),
      (err) => {
        assert.equal(err.status, 1);
        assert.match(err.stdout, new RegExp(`${relPath}: email\\.reset`));
        return true;
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("values may carry tags but not attributes", () => {
  const catalogue = JSON.stringify({
    plain: "Open <0>settings</0> and <strong>save</strong>",
    nested: { link: 'Read <0 href="https://example.com">this</0>' },
    target: '<1 target=_blank rel="opener">x</1>',
    slash: '<0/href="https://example.com">x</0>',
    selfClosing: "Line<br/>break and <0/> here",
    quotedBracket: '<link ">" href="https://example.com">text</link>',
    bareQuote: '<0 "x">text</0>',
    percent: "Low (<15%)",
    minute: "<1 min",
    lessThan: "Under < 5 kg, or a<b",
    closing: "Fat</|final|> and <!-- note -->",
    doctype: '<!x href="https://example.com">x',
    openAtEnd: 'Read more <0 href="https://example.com"',
  });
  assert.deepEqual(valuesWithAttributes(catalogue), [
    "nested.link",
    "target",
    "slash",
    "quotedBracket",
    "doctype",
    "openAtEnd",
  ]);
});

test("only web catalogues are value-checked, because mobile has no <Trans>", () => {
  assert.ok(
    rendersMarkup("SparkyFitnessFrontend/public/locales/de/translation.json"),
  );
  assert.ok(
    !rendersMarkup(
      "SparkyFitnessMobile/src/localization/locales/de/translation.json",
    ),
  );
  // Skipping mobile is only safe while it renders values as plain text.
  const withTrans = tracked("SparkyFitnessMobile/src").filter(
    (p) =>
      /\.[jt]sx?$/.test(p) &&
      /<Trans\b|\bTrans\b[^\n]*from ['"]react-i18next['"]/.test(
        readFileSync(resolve(root, p), "utf8"),
      ),
  );
  assert.deepEqual(withTrans, []);
});

test("JSON escapes cannot hide a tag", () => {
  const raw =
    '{"k": "\\u003c0 href=\\"https://example.com\\"\\u003ex\\u003c/0\\u003e"}';
  assert.ok(!raw.includes("<"), "the raw text has no literal tag");
  assert.deepEqual(valuesWithAttributes(raw), ["k"]);
});

test("other branches have no allowlist, so every path is outside it", () => {
  assert.equal(allowedFor("feat/anything"), null);
  assert.deepEqual(
    outsideAllowlist("umbrel/update-app-package", [
      "umbrel/sparkyfitness/umbrel-app.yml",
    ]),
    ["umbrel/sparkyfitness/umbrel-app.yml"],
  );
});

test("links are found, abbreviations and file names are not", () => {
  const has = (t) => [...linksIn(t)];
  assert.deepEqual(has("Visit https://evil.com/x now."), [
    "https://evil.com/x",
  ]);
  assert.deepEqual(has("Read bit.ly/abc, or mail a@b.io"), [
    "bit.ly/abc",
    "a@b.io",
  ]);
  assert.deepEqual(has("www.foo.org and //evil.net/p"), [
    "www.foo.org",
    "//evil.net/p",
  ]);
  assert.deepEqual(has("javascript:alert(1)").length, 1);
  for (const t of [
    "t.ex. 5 kg",
    "f.eks. og p.ex.",
    "2x.png",
    "Node.js",
    "z.B. 3",
    "dr.chen",
    "settings.json",
  ])
    assert.deepEqual(has(t), [], t);
});

test("a translation may repeat English links or keep its own, not add new ones", () => {
  const path = "SparkyFitnessFrontend/public/locales/de/translation.json";
  const english = JSON.stringify({
    a: "See https://sparkyfitness.com",
    b: "Plain",
  });
  const base = JSON.stringify({
    a: "Siehe https://sparkyfitness.com",
    c: "http://deine-instanz.com",
  });
  const head = JSON.stringify({
    a: "Siehe https://sparkyfitness.com",
    b: "Mehr auf evil.example.com/login",
    c: "http://deine-instanz.com",
    d: "Schreib an help@evil.io",
  });
  assert.deepEqual(newLinks(path, head, base, english), [
    "b: evil.example.com/login",
    "d: help@evil.io",
  ]);
  // A link only counts as known under its own key.
  assert.deepEqual(
    newLinks(
      path,
      JSON.stringify({ b: "https://sparkyfitness.com" }),
      base,
      english,
    ),
    ["b: https://sparkyfitness.com"],
  );
  assert.throws(() => newLinks(path, "{not json", base, english));
});

test("widget strings and .strings files are checked by key too", () => {
  const xml = (v) =>
    `<resources xmlns:android="http://schemas.android.com/apk/res/android"><string name="t">${v}</string></resources>`;
  const xmlPath =
    "SparkyFitnessMobile/targets/android-widget/res/values-de/widget_strings.xml";
  assert.deepEqual(
    newLinks(xmlPath, xml("Hallo"), xml("Hallo"), xml("Hello")),
    [],
  );
  assert.deepEqual(
    newLinks(xmlPath, xml("Mehr: evil.com"), xml("Hallo"), xml("Hello")),
    ["t: evil.com"],
  );
  const strings = (v) => `"widget.title" = "${v}";\n`;
  const sPath =
    "SparkyFitnessMobile/targets/widget/de.lproj/Localizable.strings";
  assert.deepEqual(
    newLinks(
      sPath,
      strings("Gehe zu www.evil.org"),
      strings("Hallo"),
      strings("Hi"),
    ),
    ["widget.title: www.evil.org"],
  );
});

test("every catalogue maps to its English source, and today none adds a link", () => {
  for (const p of catalogues.filter((p) => !isEnglish(p)))
    assert.equal(
      tracked(englishPathFor(p)).length,
      1,
      `${p} -> ${englishPathFor(p)}`,
    );
  const found = catalogues
    .filter((p) => !isEnglish(p))
    .flatMap((p) => {
      const text = readFileSync(resolve(root, p), "utf8");
      return newLinks(
        p,
        text,
        text,
        readFileSync(resolve(root, englishPathFor(p)), "utf8"),
      );
    });
  assert.deepEqual(found, []);
});

test("links in any scheme, unlisted or non-ASCII domains are found", () => {
  const has = (t) => [...linksIn(t)];
  assert.deepEqual(has("Go to example.world/login"), ["example.world/login"]);
  assert.deepEqual(has("Text sms:+15551234567"), ["sms:+15551234567"]);
  assert.deepEqual(has("sftp://evil.host/x"), ["sftp://evil.host/x"]);
  assert.deepEqual(has("myapp://open/item"), ["myapp://open/item"]);
  assert.deepEqual(has("пример.рф/вход"), ["пример.рф/вход"]);
  for (const t of ["dr.chen", "ee.uu", "Speichern. Fertig", "i.e.", "U.S.A."])
    assert.deepEqual(has(t), [], t);
});

test("encoded links in widget and JSON files are decoded before the check", () => {
  const xml = (v) => `<resources><string name="t">${v}</string></resources>`;
  const p =
    "SparkyFitnessMobile/targets/android-widget/res/values-de/widget_strings.xml";
  assert.deepEqual(
    newLinks(
      p,
      xml("https&#x3A;&#x2F;&#x2F;example&#x2E;com"),
      xml("Hallo"),
      xml("Hi"),
    ),
    ["t: https://example.com"],
  );
  assert.deepEqual(
    newLinks(p, xml("https\\u003a//evil\\u002ecom"), xml("Hallo"), xml("Hi")),
    ["t: https://evil.com"],
  );
  const strings = (v) => `"t" = "${v}";\n`;
  const s = "SparkyFitnessMobile/targets/widget/de.lproj/Localizable.strings";
  assert.deepEqual(
    newLinks(
      s,
      strings("https\\U003A//evil.com"),
      strings("Hallo"),
      strings("Hi"),
    ),
    ["t: https://evil.com"],
  );
  const json = (v) => JSON.stringify({ email: { test: v } });
  const j = "SparkyFitnessServer/locales/de/translation.json";
  assert.deepEqual(
    newLinks(
      j,
      json(
        '<a href="&#104;&#116;&#116;&#112;&#115;&#58;&#47;&#47;evil&#46;com">',
      ),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https&#58//evil&#46com">{{resetUrl}}</a>'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https&#x3a//evil&#46com">{{resetUrl}}</a>'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https&colon;&sol;&sol;phish&period;org">'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://phish.org"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https&Tab;://ev&Tab;il&Tab;.com">{{resetUrl}}</a>'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https&NewLine;://evil.com">{{resetUrl}}</a>'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
  assert.deepEqual(
    newLinks(
      j,
      json('<a href="https\t://evil.com">{{resetUrl}}</a>'),
      json("Hallo"),
      json("Hello"),
    ),
    ["email.test: https://evil.com"],
  );
});

test("a malformed, partial or symlinked catalogue throws instead of passing", () => {
  const s = "SparkyFitnessMobile/targets/widget/de.lproj/Localizable.strings";
  const x =
    "SparkyFitnessMobile/targets/android-widget/res/values-de/widget_strings.xml";
  assert.throws(() => newLinks(s, '"t" = "go evil.com"\n', null, null));
  assert.throws(() => newLinks(s, '"a" = "ok";\n"b" = "evil.com"', null, null));
  assert.throws(() => newLinks(s, "../../../../package.json", null, null));
  assert.throws(() => newLinks(x, "../../../../package.json", null, null));
  assert.throws(() =>
    newLinks(
      x,
      '<resources><string name="t">a</string><string name="u">evil.com</resources>',
      null,
      null,
    ),
  );
});

test("hidden characters and wide dots cannot disguise a link, CJK sentences are not links", () => {
  const has = (t) => [...linksIn(t)];
  assert.deepEqual(has("evil​.com/login"), ["evil.com/login"]);
  assert.deepEqual(has("evil。com/login"), ["evil.com/login"]);
  assert.deepEqual(has("evil．com"), ["evil.com"]);
  assert.deepEqual(has("https：//evil.com"), ["https://evil.com"]);
  assert.deepEqual(has("请访问evil。com"), ["evil.com"]);
  assert.deepEqual(has("登录已过期。请打开"), []);
  assert.deepEqual(has("由AI驱动。全面记录您的饮食"), []);
  assert.deepEqual(has("家族のために。AI搭載。食事"), []);
});
