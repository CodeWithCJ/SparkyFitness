const fs = require('node:fs');

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrArrayOfStrings(value) {
  return typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function flattenLocale(value, prefix = '', result = {}) {
  if (isStringOrArrayOfStrings(value)) {
    result[prefix] = value;
    return result;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenLocale(child, prefix ? `${prefix}.${key}` : key, result);
    }
    return result;
  }
  result[prefix] = value;
  return result;
}

function parseLocaleJson(filePath) {
  return flattenLocale(JSON.parse(fs.readFileSync(filePath, 'utf8')));
}

function getPluralBase(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) return key.slice(0, -suffix.length);
  }
  return null;
}

function getPluralSuffix(key) {
  const base = getPluralBase(key);
  return base === null ? null : key.slice(base.length);
}

function groupPluralKeys(keys) {
  const groups = new Map();
  const singles = new Set();
  for (const key of keys) {
    const base = getPluralBase(key);
    if (base === null) singles.add(key);
    else {
      if (!groups.has(base)) groups.set(base, new Set());
      groups.get(base).add(key);
    }
  }
  return [
    ...[...groups].map(([base, values]) => ({ base, isPlural: true, keys: [...values] })),
    ...[...singles].map((base) => ({ base, isPlural: false, keys: [base] })),
  ];
}

function placeholderNames(value) {
  return typeof value === 'string'
    ? [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort()
    : [];
}

function samePlaceholderMultiset(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isEmptyTranslation(value) {
  return typeof value === 'string' && value.trim() === '';
}

function translatedValueIsPresent(value) {
  if (isEmptyTranslation(value)) return false;
  if (Array.isArray(value)) return value.every((item) => !isEmptyTranslation(item));
  return true;
}

function requiredPluralForms(intlLocale) {
  return new Intl.PluralRules(intlLocale).resolvedOptions().pluralCategories.map((category) => `_${category}`);
}

function detectSingularPluralCollisions(groups, locale) {
  const pluralBases = new Set(groups.filter((group) => group.isPlural).map((group) => group.base));
  const plainKeys = new Set(groups.filter((group) => !group.isPlural).map((group) => group.base));
  return [...pluralBases]
    .filter((base) => plainKeys.has(base))
    .map((base) => ({
      rule: 'singular-plural-collision',
      locale,
      key: base,
      message: `Singular key "${base}" collides with plural forms in ${locale}`,
    }));
}

function valueType(value) {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function compareValues(sourceValue, translatedValue, key, locale, errors) {
  if (sourceValue === undefined || translatedValue === undefined) return;
  if (valueType(sourceValue) !== valueType(translatedValue)) {
    errors.push({ rule: 'type-mismatch', locale, key, sourceType: valueType(sourceValue), translatedType: valueType(translatedValue), message: `Type mismatch for "${key}" in ${locale}` });
    return;
  }
  if (Array.isArray(sourceValue)) {
    if (sourceValue.length !== translatedValue.length) {
      errors.push({ rule: 'array-length-mismatch', locale, key, sourceLength: sourceValue.length, translatedLength: translatedValue.length, message: `Array length mismatch for "${key}" in ${locale}` });
      return;
    }
    sourceValue.forEach((sourceItem, index) => {
      const translatedItem = translatedValue[index];
      if (typeof sourceItem !== typeof translatedItem) {
        errors.push({ rule: 'type-mismatch', locale, key: `${key}[${index}]`, message: `Array element type mismatch for "${key}[${index}]" in ${locale}` });
      } else if (typeof sourceItem === 'string' && !samePlaceholderMultiset(placeholderNames(sourceItem), placeholderNames(translatedItem))) {
        errors.push({ rule: 'placeholder-mismatch', locale, key: `${key}[${index}]`, sourcePlaceholders: placeholderNames(sourceItem), translatedPlaceholders: placeholderNames(translatedItem), message: `Placeholder mismatch for "${key}[${index}]" in ${locale}` });
      }
    });
    return;
  }
  if (typeof sourceValue === 'string' && typeof translatedValue === 'string' && !samePlaceholderMultiset(placeholderNames(sourceValue), placeholderNames(translatedValue))) {
    errors.push({ rule: 'placeholder-mismatch', locale, key, sourcePlaceholders: placeholderNames(sourceValue), translatedPlaceholders: placeholderNames(translatedValue), message: `Placeholder mismatch for "${key}" in ${locale}` });
  }
}

function canonicalPluralPlaceholders(source, group) {
  const values = group.keys.map((key) => source[key]).filter((value) => value !== undefined);
  return values.length ? placeholderNames(values[0]) : [];
}

class LocaleValidator {
  constructor(sourcePath, legacyTranslationPath, options = {}) {
    this.sourcePath = sourcePath;
    this.legacyTranslationPath = legacyTranslationPath;
    this.options = options;
  }

  validate() {
    const errors = [];
    let source;
    try {
      source = parseLocaleJson(this.sourcePath);
    } catch (error) {
      return { errors: [{ rule: 'malformed-json', locale: this.options.sourceLocale || 'en', path: this.sourcePath, message: `Invalid JSON in ${this.sourcePath}: ${error.message}` }], enKeys: [], plKeys: [], enValues: {}, plValues: {}, translations: {}, coverage: {} };
    }

    const sourceLocale = this.options.sourceLocale || 'en';
    const sourceIntlLocale = this.options.sourceIntlLocale || 'en-US';
    const sourceGroups = groupPluralKeys(Object.keys(source));
    for (const [key, value] of Object.entries(source)) {
      if (isEmptyTranslation(value) || (Array.isArray(value) && value.some(isEmptyTranslation))) {
        errors.push({ rule: 'empty-source-value', locale: sourceLocale, key, message: `Source value "${key}" must not be empty` });
      }
      if (!isStringOrArrayOfStrings(value)) {
        errors.push({ rule: 'invalid-source-leaf', locale: sourceLocale, key, sourceType: valueType(value), message: `Source leaf "${key}" must be a string or array of strings` });
      }
    }
    errors.push(...detectSingularPluralCollisions(sourceGroups, sourceLocale));

    const sourceRequiredForms = requiredPluralForms(sourceIntlLocale);
    for (const group of sourceGroups.filter((item) => item.isPlural)) {
      for (const key of group.keys) {
        const suffix = getPluralSuffix(key);
        if (suffix !== '_zero' && !sourceRequiredForms.includes(suffix)) {
          errors.push({ rule: 'invalid-plural-category', locale: sourceLocale, key, form: suffix, message: `Invalid source plural category "${suffix}" for ${sourceLocale}` });
        }
      }
      for (const form of sourceRequiredForms) {
        if (!Object.hasOwn(source, `${group.base}${form}`)) {
          errors.push({ rule: 'missing-plural-form', locale: sourceLocale, key: group.base, form, message: `Missing source plural form "${group.base}${form}" in ${sourceLocale}` });
        }
      }
      const canonical = canonicalPluralPlaceholders(source, group);
      for (const key of group.keys) {
        if (!samePlaceholderMultiset(placeholderNames(source[key]), canonical)) {
          errors.push({ rule: 'placeholder-mismatch', locale: sourceLocale, key, sourcePlaceholders: placeholderNames(source[key]), translatedPlaceholders: canonical, message: `Source plural placeholder mismatch for "${key}"` });
        }
      }
    }

    const localePaths = this.options.localePaths || (this.legacyTranslationPath ? [{ locale: 'pl', path: this.legacyTranslationPath, intlLocale: 'pl-PL' }] : []);
    const translations = {};
    const coverage = {};
    const sourceKeys = new Set(Object.keys(source));

    for (const target of localePaths) {
      let translated;
      try {
        translated = parseLocaleJson(target.path);
      } catch (error) {
        errors.push({ rule: 'malformed-json', locale: target.locale, path: target.path, message: `Invalid JSON in ${target.path}: ${error.message}` });
        continue;
      }
      translations[target.locale] = translated;
      const targetIntlLocale = target.intlLocale || target.locale;
      const targetRequiredForms = requiredPluralForms(targetIntlLocale);
      const targetGroups = groupPluralKeys(Object.keys(translated));
      errors.push(...detectSingularPluralCollisions(targetGroups, target.locale));

      let requiredTotal = 0;
      let presentTotal = 0;
      for (const sourceGroup of sourceGroups) {
        if (!sourceGroup.isPlural) {
          requiredTotal += 1;
          if (Object.hasOwn(translated, sourceGroup.base) && translatedValueIsPresent(translated[sourceGroup.base])) presentTotal += 1;
          if (translatedValueIsPresent(translated[sourceGroup.base])) compareValues(source[sourceGroup.base], translated[sourceGroup.base], sourceGroup.base, target.locale, errors);
          continue;
        }
        const canonical = canonicalPluralPlaceholders(source, sourceGroup);
        requiredTotal += targetRequiredForms.length;
        for (const form of targetRequiredForms) {
          const targetKey = `${sourceGroup.base}${form}`;
          if (Object.hasOwn(translated, targetKey)) {
            if (translatedValueIsPresent(translated[targetKey])) presentTotal += 1;
            if (translatedValueIsPresent(translated[targetKey]) && (form !== '_zero' || Object.hasOwn(source, `${sourceGroup.base}${form}`))) {
              if (!samePlaceholderMultiset(placeholderNames(translated[targetKey]), canonical)) {
                errors.push({ rule: 'placeholder-mismatch', locale: target.locale, key: targetKey, sourcePlaceholders: canonical, translatedPlaceholders: placeholderNames(translated[targetKey]), message: `Placeholder mismatch for "${targetKey}" in ${target.locale}` });
              }
            }
          }
        }
        for (const key of targetGroups.find((group) => group.base === sourceGroup.base)?.keys || []) {
          const suffix = getPluralSuffix(key);
          if (suffix === '_zero') {
            const targetKey = `${sourceGroup.base}_zero`;
            if (translatedValueIsPresent(translated[targetKey]) && !samePlaceholderMultiset(placeholderNames(translated[targetKey]), canonical)) {
              errors.push({ rule: 'placeholder-mismatch', locale: target.locale, key: targetKey, sourcePlaceholders: canonical, translatedPlaceholders: placeholderNames(translated[targetKey]), message: `Placeholder mismatch for "${targetKey}" in ${target.locale}` });
            }
          } else if (!targetRequiredForms.includes(suffix)) {
            errors.push({ rule: 'invalid-plural-category', locale: target.locale, key, form: suffix, message: `Invalid plural category "${suffix}" for ${target.locale}` });
          }
        }
      }

      const sourcePluralBases = new Set(sourceGroups.filter((g) => g.isPlural).map((g) => g.base));
      for (const key of Object.keys(translated)) {
        const pluralBase = getPluralBase(key);
        const isStale = !sourceKeys.has(key) && (!pluralBase || !sourcePluralBases.has(pluralBase));
        if (isStale) {
          // Stale translations are intentionally non-blocking coverage diagnostics.
          coverage[target.locale] = coverage[target.locale] || {};
          coverage[target.locale].stale = (coverage[target.locale].stale || 0) + 1;
        }
      }
      coverage[target.locale] = {
        translated: presentTotal,
        total: requiredTotal,
        missing: requiredTotal - presentTotal,
        percent: requiredTotal === 0 ? 100 : Math.round((presentTotal / requiredTotal) * 100),
        ...(coverage[target.locale] || {}),
      };
    }

    const firstLocale = localePaths[0]?.locale;
    return {
      errors,
      enKeys: Object.keys(source),
      plKeys: firstLocale ? Object.keys(translations[firstLocale] || {}) : [],
      enValues: source,
      plValues: firstLocale ? translations[firstLocale] || {} : {},
      sourceValues: source,
      translations,
      coverage,
    };
  }
}

module.exports = {
  parseLocaleJson,
  flattenLocale,
  groupPluralKeys,
  getPluralBase,
  getPluralSuffix,
  placeholderNames,
  isPlainObject,
  isStringOrArrayOfStrings,
  requiredPluralForms,
  PLURAL_SUFFIXES,
  LocaleValidator,
};
