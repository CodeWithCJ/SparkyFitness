const fs = require('node:fs');
const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isStringOrArrayOfStrings(v) { return typeof v === 'string' || (Array.isArray(v) && v.every((x) => typeof x === 'string')); }
function flattenLocale(value, prefix = '', result = {}) {
  if (isStringOrArrayOfStrings(value)) { result[prefix] = value; return result; }
  if (isPlainObject(value)) for (const [k, child] of Object.entries(value)) flattenLocale(child, prefix ? `${prefix}.${k}` : k, result);
  else result[prefix] = value;
  return result;
}
function parseLocaleJson(filePath) { return flattenLocale(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
function getPluralBase(key) { for (const suffix of PLURAL_SUFFIXES) if (key.endsWith(suffix)) return key.slice(0, -suffix.length); return null; }
function groupPluralKeys(keys) { const groups = new Map(); const singles = new Set(); for (const key of keys) { const base = getPluralBase(key); if (base) { if (!groups.has(base)) groups.set(base, new Set()); groups.get(base).add(key); } else singles.add(key); } return [...[...groups].map(([base, values]) => ({ base, isPlural: true, keys: [...values] })), ...[...singles].map((base) => ({ base, isPlural: false, keys: [base] }))]; }
function placeholderNames(value) { return typeof value === 'string' ? [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort() : []; }
function samePlaceholderMultiset(a, b) { return a.length === b.length && a.every((v, i) => v === b[i]); }
function requiredPluralForms(intlLocale) { return [...new Intl.PluralRules(intlLocale).resolvedOptions().pluralCategories].map((category) => `_${category}`); }
function detectCollisions(groups, locale) { const plural = new Set(groups.filter((g) => g.isPlural).map((g) => g.base)); const plain = new Set(groups.filter((g) => !g.isPlural).map((g) => g.base)); return [...plural].filter((base) => plain.has(base)).map((base) => ({ rule: 'singular-plural-collision', locale, key: base, message: `Singular key "${base}" collides with plural forms in ${locale}` })); }
function compareValueTypes(source, translation, key, locale, errors) { if (source === undefined || translation === undefined) return; const sourceArray = Array.isArray(source); const translatedArray = Array.isArray(translation); if (sourceArray !== translatedArray || typeof source !== typeof translation) { errors.push({ rule: 'type-mismatch', locale, key, message: `Type mismatch for "${key}" in ${locale}` }); return; } if (typeof source === 'string' && typeof translation === 'string' && !samePlaceholderMultiset(placeholderNames(source), placeholderNames(translation))) errors.push({ rule: 'placeholder-mismatch', locale, key, message: `Placeholder mismatch for "${key}" in ${locale}`, enPlaceholders: placeholderNames(source), translatedPlaceholders: placeholderNames(translation) }); }
class LocaleValidator {
  constructor(sourcePath, translationPath, options = {}) { this.enPath = sourcePath; this.plPath = translationPath; this.options = options; }
  validate() {
    const errors = []; let source;
    try { source = parseLocaleJson(this.enPath); } catch (err) { return { errors: [{ rule: 'malformed-json', path: this.enPath, message: err.message }], enKeys: [], plKeys: [], enValues: {}, plValues: {} }; }
    const sourceLocale = this.options.sourceLocale || 'en'; const sourceIntlLocale = this.options.sourceIntlLocale || 'en-US';
    const sourceGroups = groupPluralKeys(Object.keys(source));
    errors.push(...detectCollisions(sourceGroups, sourceLocale));
    const requiredSource = requiredPluralForms(sourceIntlLocale);
    for (const group of sourceGroups.filter((g) => g.isPlural)) for (const form of requiredSource) if (!Object.hasOwn(source, `${group.base}${form}`)) errors.push({ rule: 'missing-plural-form', locale: sourceLocale, key: group.base, form, message: `Missing plural form "${group.base}${form}" in source locale` });
    const paths = this.options.localePaths || (this.plPath ? [{ locale: 'pl', path: this.plPath, intlLocale: 'pl-PL' }] : []);
    const translations = {};
    for (const item of paths) {
      let data; try { data = parseLocaleJson(item.path); } catch (err) { errors.push({ rule: 'malformed-json', locale: item.locale, path: item.path, message: err.message }); continue; }
      translations[item.locale] = data; errors.push(...detectCollisions(groupPluralKeys(Object.keys(data)), item.locale));
      for (const key of Object.keys(data)) if (!Object.hasOwn(source, key) && !getPluralBase(key)) errors.push({ rule: 'extra-key', locale: item.locale, key, message: `Translation key "${key}" is absent from source` });
      for (const key of Object.keys(data)) compareValueTypes(source[key], data[key], key, item.locale, errors);
      for (const group of sourceGroups.filter((g) => g.isPlural)) for (const form of Object.keys(data).filter((key) => key.startsWith(`${group.base}_`))) compareValueTypes(source[form], data[form], form, item.locale, errors);
    }
    const firstTranslation = paths[0]?.locale || 'pl'; const firstData = translations[firstTranslation] || {};
    return { errors, enKeys: Object.keys(source), plKeys: Object.keys(firstData), enValues: source, plValues: firstData, sourceValues: source, translations, coverage: Object.fromEntries(paths.map((p) => [p.locale, { translated: Object.keys(translations[p.locale] || {}).filter((k) => Object.hasOwn(source, k)).length, total: Object.keys(source).length }])) };
  }
}
module.exports = { parseLocaleJson, flattenLocale, groupPluralKeys, getPluralBase, placeholderNames, isPlainObject, isStringOrArrayOfStrings, PLURAL_SUFFIXES, requiredPluralForms, LocaleValidator };
