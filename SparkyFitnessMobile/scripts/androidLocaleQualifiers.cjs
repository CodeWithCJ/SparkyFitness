// Android resource qualifiers are not BCP-47 tags: a region is written `-rXX`, a
// script needs the `b+` form, and a few languages keep a legacy code. Weblate emits
// these (values-pt-rBR, values-zh-rCN, values-in), so the registry tag and the
// directory name have to be translated in both directions.
const ANDROID_TO_TAG = {
  in: 'id',
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};
const TAG_TO_ANDROID = Object.fromEntries(
  Object.entries(ANDROID_TO_TAG).map(([qualifier, tag]) => [tag, qualifier])
);
const REGION_TAG = /^[A-Za-z]{2,3}-(?:[A-Za-z]{2}|\d{3})$/;

function localeFromAndroidDir(name, source) {
  if (name === 'values') return source;
  if (!name.startsWith('values-')) return null;
  const qualifier = name.slice('values-'.length);
  const tag = qualifier.startsWith('b+')
    ? qualifier.slice(2).replaceAll('+', '-')
    : qualifier.replace(/-r(?=(?:[A-Za-z]{2}|\d{3})$)/, '-');
  return ANDROID_TO_TAG[tag] ?? tag;
}

function androidDirForLocale(locale, source) {
  if (locale === source) return 'values';
  const qualifier = TAG_TO_ANDROID[locale] ?? locale;
  if (!qualifier.includes('-')) return `values-${qualifier}`;
  return REGION_TAG.test(qualifier)
    ? `values-${qualifier.replace('-', '-r')}`
    : `values-b+${qualifier.replaceAll('-', '+')}`;
}

module.exports = { localeFromAndroidDir, androidDirForLocale };
