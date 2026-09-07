#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

// `%%` must be consumed first: otherwise in "50%% goal" the second `%` starts a
// match, takes the space as a flag and `g` as the conversion, inventing a "% g"
// argument that differs per language.
const ANDROID_FORMAT = /%%|%(?:\d+\$)?(?:[-#+ 0,(<]*\d*(?:\.\d+)?)?[a-zA-Z]/g;
const IOS_FORMAT =
  /%%|%(?:\d+\$)?(?:[-+ #0]*\d*(?:\.\d+)?)?(?:lld|llu|ld|lu|@|d|D|i|u|U|o|x|X|f|F|e|E|g|G|c|C|s|S|p)/g;
const isBlank = (value) => value.trim() === '';
const formats = (value, regex) =>
  [...value.matchAll(regex)]
    .map((match) => match[0])
    .filter((match) => match !== '%%')
    .sort();
const equal = (left, right) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export function parseAndroidStrings(content) {
  const values = new Map();
  const re = /<string\b[^>]*\bname="([^"]+)"[^>]*>([^<]*)<\/string>/g;
  let match;
  while ((match = re.exec(content)) !== null)
    values.set(
      match[1],
      match[2].replaceAll("\\'", "'").replaceAll('&apos;', "'")
    );
  const declarations = (content.match(/<string\b/g) ?? []).length;
  if (declarations !== values.size)
    throw new Error(
      'Android widget resource XML has malformed or duplicate string declarations'
    );
  return values;
}
export function parseIosStrings(content) {
  const values = new Map();
  const re = /"((?:\\.|[^"\\])*)"\s*=\s*"((?:\\.|[^"\\])*)"\s*;/g;
  let match;
  while ((match = re.exec(content)) !== null) values.set(match[1], match[2]);
  if (content.trim() && values.size === 0)
    throw new Error('iOS Localizable.strings has no parseable declarations');
  return values;
}
function localeFromAndroidDir(name, source) {
  if (name === 'values') return source;
  if (!name.startsWith('values-')) return null;
  const qualifier = name.slice('values-'.length);
  return qualifier.startsWith('b+')
    ? qualifier.slice(2).replaceAll('+', '-')
    : qualifier;
}
function androidDirForLocale(locale, source) {
  if (locale === source) return 'values';
  // Android BCP-47 resource syntax: language-only is values-de; regional/script tags use b+.
  return locale.includes('-')
    ? `values-b+${locale.replaceAll('-', '+')}`
    : `values-${locale}`;
}
function sourceMap(maps, source, surface) {
  const result = maps.get(source);
  if (!result)
    throw new Error(`${surface} has no source resource catalog for ${source}`);
  return result;
}
function validateSurface({ maps, source, surface, formatRegex }) {
  const errors = [];
  const coverage = {};
  const base = sourceMap(maps, source, surface);
  for (const [key, value] of base) {
    if (isBlank(value))
      errors.push(`${surface} source ${source}:${key} is empty`);
    if (/\{\{.*?\}\}/.test(value))
      errors.push(
        `${surface} source ${source}:${key} uses i18next placeholder syntax`
      );
  }
  for (const [locale, target] of maps) {
    let translated = 0;
    for (const [key, value] of target) {
      if (!base.has(key)) {
        errors.push(`${surface} ${locale}:${key} does not exist in source`);
        continue;
      }
      if (isBlank(value)) {
        continue;
      }
      if (/\{\{.*?\}\}/.test(value))
        errors.push(
          `${surface} ${locale}:${key} uses i18next placeholder syntax`
        );
      if (
        !equal(formats(base.get(key), formatRegex), formats(value, formatRegex))
      )
        errors.push(`${surface} ${locale}:${key} placeholder mismatch`);
      translated += 1;
    }
    coverage[locale] = {
      translated,
      total: base.size,
      missing: base.size - translated,
      percent:
        base.size === 0 ? 100 : Math.round((translated / base.size) * 100),
    };
  }
  return { errors, coverage };
}
export function validateNativeWidgetLocales({ root, registry }) {
  const source = registry.sourceLocale;
  const shipped = new Set(Object.keys(registry.locales));
  const androidRoot = path.join(root, 'targets/android-widget/res');
  const iosRoot = path.join(root, 'targets/widget');
  const android = new Map();
  for (const entry of fs.readdirSync(androidRoot, { withFileTypes: true })) {
    const locale = localeFromAndroidDir(entry.name, source);
    const file = path.join(androidRoot, entry.name, 'widget_strings.xml');
    if (locale && fs.existsSync(file))
      android.set(locale, parseAndroidStrings(fs.readFileSync(file, 'utf8')));
  }
  const ios = new Map();
  for (const entry of fs.readdirSync(iosRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.endsWith('.lproj')) continue;
    const locale = entry.name.slice(0, -'.lproj'.length);
    const file = path.join(iosRoot, entry.name, 'Localizable.strings');
    if (fs.existsSync(file))
      ios.set(locale, parseIosStrings(fs.readFileSync(file, 'utf8')));
  }
  const androidResult = validateSurface({
    maps: android,
    source,
    surface: 'Android widget',
    formatRegex: ANDROID_FORMAT,
  });
  const iosResult = validateSurface({
    maps: ios,
    source,
    surface: 'iOS widget',
    formatRegex: IOS_FORMAT,
  });
  const errors = [...androidResult.errors, ...iosResult.errors];
  for (const locale of shipped) {
    if (!android.has(locale))
      errors.push(
        `Shipped locale ${locale} is missing Android widget ${androidDirForLocale(locale, source)}/widget_strings.xml`
      );
    if (!ios.has(locale))
      errors.push(
        `Shipped locale ${locale} is missing iOS widget ${locale}.lproj/Localizable.strings`
      );
  }
  return {
    errors,
    androidCoverage: androidResult.coverage,
    iosCoverage: iosResult.coverage,
    androidDirForLocale,
  };
}
function argumentValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : path.resolve(process.argv[index + 1]);
}
function main() {
  const root = argumentValue('--root', path.resolve(import.meta.dirname, '..'));
  const registryPath = argumentValue(
    '--registry',
    path.join(root, 'src/localization/localeRegistry.json')
  );
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const result = validateNativeWidgetLocales({ root, registry });
  console.log('Android widget translations:');
  for (const [locale, coverage] of Object.entries(result.androidCoverage))
    console.log(
      `  ${locale}: ${coverage.translated}/${coverage.total} (${coverage.missing} missing)`
    );
  console.log('iOS widget translations:');
  for (const [locale, coverage] of Object.entries(result.iosCoverage))
    console.log(
      `  ${locale}: ${coverage.translated}/${coverage.total} (${coverage.missing} missing)`
    );
  if (result.errors.length) throw new Error(result.errors.join('\n'));
}
if (
  process.argv[1] &&
  import.meta?.url === new URL(`file://${process.argv[1]}`).href
)
  main();
