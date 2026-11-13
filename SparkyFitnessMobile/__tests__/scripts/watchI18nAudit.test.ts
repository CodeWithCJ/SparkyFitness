import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(pathToFileURL(__filename));
const {
  auditWatch,
  scanBareLiterals,
  parseStringsKeys,
  readLiteral,
} = require('../../scripts/i18n-audit/watchScanner.cjs');

const repoRoot = path.resolve(__dirname, '../..');

function makeWatchTarget(swift: string, strings: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-i18n-'));
  fs.mkdirSync(path.join(root, 'targets/watch/Presentation'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'targets/watch/en.lproj'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'targets/watch/Presentation/View.swift'),
    swift
  );
  fs.writeFileSync(
    path.join(root, 'targets/watch/en.lproj/Localizable.strings'),
    strings
  );
  return root;
}

describe('watch i18n audit', () => {
  it('finds no hardcoded watch text, missing keys, or mismatched defaults', () => {
    const result = auditWatch(repoRoot);
    expect(result.bareLiterals).toEqual([]);
    expect(result.missingKeys).toEqual([]);
    expect(result.mismatchedDefaults).toEqual([]);
  });

  it('flags bare UI literals but not localized, interpolation-only, or ignored text', () => {
    const root = makeWatchTarget(
      [
        'Text("Nothing logged yet")',
        'Button("Add Set") { }',
        'Text(String(localized: "watch.ok", defaultValue: "OK"))',
        'Text("\\(value) \\(unit)")',
        'Text("--")',
        '.alert(\n"Update?", isPresented: $a) {}',
        '.confirmationDialog(\n"Delete?", isPresented: $b) {}',
        'Text("Raw") // i18n-ignore',
      ].join('\n'),
      '"watch.ok" = "OK";\n'
    );
    const found = scanBareLiterals(root).map((f: { text: string }) => f.text);
    expect(found).toEqual([
      'Nothing logged yet',
      'Add Set',
      'Update?',
      'Delete?',
    ]);
    expect(auditWatch(root).hasErrors).toBe(true);
  });

  it('fails when String(localized:) uses a key missing from Localizable.strings', () => {
    const root = makeWatchTarget(
      'Text(String(localized: "watch.missing", defaultValue: "Hi"))',
      '"watch.other" = "Other";\n'
    );
    expect(
      auditWatch(root).missingKeys.map((k: { key: string }) => k.key)
    ).toEqual(['watch.missing']);
  });

  it('fails when a static defaultValue differs from the English catalog', () => {
    const root = makeWatchTarget(
      'Text(String(localized: "watch.ok", defaultValue: "Okay"))',
      '"watch.ok" = "OK";\n'
    );
    expect(
      auditWatch(root).mismatchedDefaults.map((k: { key: string }) => k.key)
    ).toEqual(['watch.ok']);
  });

  it('accepts interpolated defaults and matching static ones', () => {
    const root = makeWatchTarget(
      [
        'Text(String(localized: "watch.a", defaultValue: "Hi \\(name)"))',
        'Text(String(localized: "watch.b", defaultValue: "It\'s \\"ok\\""))',
      ].join('\n'),
      '"watch.a" = "Hi %@";\n"watch.b" = "It\\\'s \\"ok\\"";\n'
    );
    expect(auditWatch(root).hasErrors).toBe(false);
  });

  it('parses nested interpolation and escaped quotes', () => {
    expect(readLiteral('a \\(f(b)) c")', 0)).toBe('a  c');
    expect(readLiteral('say \\"hi\\"")', 0)).toBe('say hi');
    expect([...parseStringsKeys('"a.b" = "It\\\'s";\n').keys()]).toEqual([
      'a.b',
    ]);
  });
});
