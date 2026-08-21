const fs = require('node:fs');

const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringOrArrayOfStrings(value) {
  if (typeof value === 'string') return true;
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === 'string');
  }
  return false;
}

function flattenLocale(value, prefix = '', result = {}) {
  if (isStringOrArrayOfStrings(value)) {
    result[prefix] = value;
    return result;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const next = prefix ? `${prefix}.${key}` : key;
      flattenLocale(child, next, result);
    }
    return result;
  }
  result[prefix] = value;
  return result;
}

function parseLocaleJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  return flattenLocale(data);
}

function getPluralBase(key) {
  for (const suffix of PLURAL_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return key.slice(0, key.length - suffix.length);
    }
  }
  return null;
}

function groupPluralKeys(keys) {
  const groups = new Map();
  const singles = new Set();

  for (const key of keys) {
    const base = getPluralBase(key);
    if (base !== null) {
      if (!groups.has(base)) {
        groups.set(base, new Set());
      }
      groups.get(base).add(key);
    } else {
      // Collect plain keys unconditionally. Doing so even when a plural group
      // of the same base exists is intentional: it lets
      // detectSingularPluralCollision() spot a plain key that collides with a
      // plural group, regardless of property order in the locale file.
      singles.add(key);
    }
  }

  const result = [];
  for (const [base, keys] of groups) {
    result.push({ base, isPlural: true, keys: [...keys] });
  }
  for (const key of singles) {
    result.push({ base: key, isPlural: false, keys: [key] });
  }
  return result;
}

function placeholderNames(value) {
  if (typeof value !== 'string') return [];
  return [...value.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
}

function samePlaceholderMultiset(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function firstAvailablePluralValue(enFormMap, plFormMap) {
  const forms = [...new Set([...enFormMap.keys(), ...plFormMap.keys()])];
  for (const form of forms) {
    const val = enFormMap.get(form) ?? plFormMap.get(form);
    if (val !== undefined) return val;
  }
  return undefined;
}

/**
 * Detects a plain (singular) key sharing its base with a plural group in the
 * same locale, e.g. both `item` and `item_one`/`item_other`. This is ambiguous
 * for i18next lookups and is a structural error that cannot be suppressed.
 */
function detectSingularPluralCollision(groups, localeName) {
  const errors = [];
  const pluralBases = new Set();
  const plainKeys = new Set();

  for (const group of groups) {
    if (group.isPlural) {
      pluralBases.add(group.base);
    } else {
      plainKeys.add(group.base);
    }
  }

  for (const base of pluralBases) {
    if (plainKeys.has(base)) {
      const forms = groups
        .find((g) => g.base === base && g.isPlural)
        .keys.map((k) => k.slice(base.length));
      errors.push({
        rule: 'singular-plural-collision',
        locale: localeName,
        key: base,
        plain_key: base,
        plural_forms: forms,
        message: `Singular key "${base}" collides with plural forms in ${localeName}: ${forms.join(', ')}`,
      });
    }
  }

  return errors;
}

class LocaleValidator {
  constructor(enPath, plPath) {
    this.enPath = enPath;
    this.plPath = plPath;
  }

  validate() {
    const errors = [];

    let enData, plData;

    try {
      enData = parseLocaleJson(this.enPath);
    } catch (err) {
      errors.push({
        rule: 'malformed-json',
        path: this.enPath,
        message: `Invalid JSON in ${this.enPath}: ${err.message}`,
      });
      return { errors, enKeys: [], plKeys: [], enValues: {}, plValues: {} };
    }

    try {
      plData = parseLocaleJson(this.plPath);
    } catch (err) {
      errors.push({
        rule: 'malformed-json',
        path: this.plPath,
        message: `Invalid JSON in ${this.plPath}: ${err.message}`,
      });
      return { errors, enKeys: [], plKeys: [], enValues: {}, plValues: {} };
    }

    const enGroups = groupPluralKeys(Object.keys(enData));
    const plGroups = groupPluralKeys(Object.keys(plData));

    const enBases = new Set(enGroups.map((g) => g.base));
    const plBases = new Set(plGroups.map((g) => g.base));

    // Detect a plain key colliding with a plural group of the same base.
    for (const localeName of ['en', 'pl']) {
      const isEn = localeName === 'en';
      const groups = isEn ? enGroups : plGroups;
      const collisionErrors = detectSingularPluralCollision(groups, localeName);
      for (const error of collisionErrors) {
        errors.push(error);
      }
    }

    for (const base of enBases) {
      if (!plBases.has(base)) {
        const enGroup = enGroups.find((g) => g.base === base);
        if (enGroup.isPlural) {
          errors.push({
            rule: 'missing-plural-group',
            locale: 'pl',
            key: base,
            message: `Missing plural group "${base}" in Polish locale`,
          });
        } else {
          errors.push({
            rule: 'missing-key',
            locale: 'pl',
            key: base,
            message: `Missing key "${base}" in Polish locale`,
          });
        }
      }
    }

    for (const base of plBases) {
      if (!enBases.has(base)) {
        errors.push({
          rule: 'missing-key',
          locale: 'en',
          key: base,
          message: `Missing key "${base}" in English locale`,
        });
      }
    }

    const enGroupMap = new Map(enGroups.map((g) => [g.base, g]));
    const plGroupMap = new Map(plGroups.map((g) => [g.base, g]));

    for (const base of enBases) {
      if (!plBases.has(base)) continue;
      const enGroup = enGroupMap.get(base);
      const plGroup = plGroupMap.get(base);

      if (enGroup.isPlural !== plGroup.isPlural) {
        errors.push({
          rule: 'plural-mismatch',
          key: base,
          message: `Key "${base}" is plural in one locale but singular in another`,
        });
        continue;
      }

      if (enGroup.isPlural) {
        const enForms = new Set();
        const plForms = new Set();
        for (const key of enGroup.keys) {
          enForms.add('_' + key.slice(base.length + 1));
        }
        for (const key of plGroup.keys) {
          plForms.add('_' + key.slice(base.length + 1));
        }

        const requiredEn = ['_one', '_other'];
        const requiredPl = ['_one', '_few', '_many', '_other'];

        for (const form of requiredEn) {
          if (!enForms.has(form)) {
            errors.push({
              rule: 'missing-plural-form',
              locale: 'en',
              key: base,
              form,
              message: `Missing plural form "${base}${form}" in English locale`,
            });
          }
        }

        for (const form of requiredPl) {
          if (!plForms.has(form)) {
            errors.push({
              rule: 'missing-plural-form',
              locale: 'pl',
              key: base,
              form,
              message: `Missing plural form "${base}${form}" in Polish locale`,
            });
          }
        }

        const enFormMap = new Map();
        for (const key of enGroup.keys) {
          enFormMap.set('_' + key.slice(base.length + 1), enData[key]);
        }
        const plFormMap = new Map();
        for (const key of plGroup.keys) {
          plFormMap.set('_' + key.slice(base.length + 1), plData[key]);
        }

        // Canonical placeholder set for the whole plural group. Prefer EN _one;
        // if absent (which is already a structural error), fall back to the
        // first available form purely to collect additional diagnostics.
        const canonicalForm =
          enFormMap.get('_one') ?? firstAvailablePluralValue(enFormMap, plFormMap);
        const canonicalPlaceholders = placeholderNames(canonicalForm ?? '');

        const allForms = new Set([...enFormMap.keys(), ...plFormMap.keys()]);
        for (const form of allForms) {
          const checks = [
            ['en', enFormMap.get(form)],
            ['pl', plFormMap.get(form)],
          ];
          for (const [locale, val] of checks) {
            if (val === undefined) continue;
            const placeholders = placeholderNames(val);
            if (!samePlaceholderMultiset(placeholders, canonicalPlaceholders)) {
              errors.push({
                rule: 'placeholder-mismatch',
                locale,
                key: `${base}${form}`,
                enPlaceholders: placeholderNames(enFormMap.get(form) ?? ''),
                plPlaceholders: placeholderNames(plFormMap.get(form) ?? ''),
                forms: [...allForms],
                message: `Placeholder mismatch for "${base}${form}" in ${locale} (expected ${canonicalPlaceholders.join(', ') || 'none'})`,
              });
            }
          }
        }
      } else {
        const enVal = enData[base];
        const plVal = plData[base];

        if (Array.isArray(enVal) || Array.isArray(plVal)) {
          if (Array.isArray(enVal) && !Array.isArray(plVal)) {
            errors.push({
              rule: 'type-mismatch',
              key: base,
              enType: 'array',
              plType: typeof plVal,
              message: `Type mismatch for "${base}": EN is array, PL is ${typeof plVal}`,
            });
          } else if (!Array.isArray(enVal) && Array.isArray(plVal)) {
            errors.push({
              rule: 'type-mismatch',
              key: base,
              enType: typeof enVal,
              plType: 'array',
              message: `Type mismatch for "${base}": EN is ${typeof enVal}, PL is array`,
            });
          } else if (Array.isArray(enVal) && Array.isArray(plVal)) {
            if (enVal.length !== plVal.length) {
              errors.push({
                rule: 'array-length-mismatch',
                key: base,
                enLength: enVal.length,
                plLength: plVal.length,
                message: `Array length mismatch for "${base}": EN has ${enVal.length}, PL has ${plVal.length}`,
              });
            } else {
              for (let i = 0; i < enVal.length; i++) {
                const enEl = enVal[i];
                const plEl = plVal[i];
                if (typeof enEl !== 'string' || typeof plEl !== 'string') {
                  errors.push({
                    rule: 'type-mismatch',
                    key: `${base}[${i}]`,
                    message: `Element type mismatch at "${base}[${i}]"`,
                  });
                } else {
                  const enPlaceholders = placeholderNames(enEl);
                  const plPlaceholders = placeholderNames(plEl);
                  if (!samePlaceholderMultiset(enPlaceholders, plPlaceholders)) {
                    errors.push({
                      rule: 'placeholder-mismatch',
                      key: `${base}[${i}]`,
                      enPlaceholders,
                      plPlaceholders,
                      message: `Placeholder mismatch for "${base}[${i}]"`,
                    });
                  }
                }
              }
            }
          }
        } else if (typeof enVal !== typeof plVal) {
          errors.push({
            rule: 'type-mismatch',
            key: base,
            enType: typeof enVal,
            plType: typeof plVal,
            message: `Type mismatch for "${base}": EN is ${typeof enVal}, PL is ${typeof plVal}`,
          });
        } else if (typeof enVal === 'string' && typeof plVal === 'string') {
          const enPlaceholders = placeholderNames(enVal);
          const plPlaceholders = placeholderNames(plVal);
          if (!samePlaceholderMultiset(enPlaceholders, plPlaceholders)) {
            errors.push({
              rule: 'placeholder-mismatch',
              key: base,
              enPlaceholders,
              plPlaceholders,
              message: `Placeholder mismatch for "${base}"`,
            });
          }
        }
      }
    }

    return { errors, enKeys: Object.keys(enData), plKeys: Object.keys(plData), enValues: enData, plValues: plData };
  }
}

module.exports = {
  parseLocaleJson,
  flattenLocale,
  groupPluralKeys,
  getPluralBase,
  placeholderNames,
  isPlainObject,
  isStringOrArrayOfStrings,
  PLURAL_SUFFIXES,
  LocaleValidator,
};
