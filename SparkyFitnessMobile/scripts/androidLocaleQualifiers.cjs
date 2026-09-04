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
// `values-` is shared with every other Android qualifier, so a locale has to be
// recognized rather than assumed: values-night, values-v31 and values-sw600dp
// are not translation units.
const ANDROID_LANGUAGE = /^[a-z]{2,3}$/;
const ANDROID_LANGUAGE_REGION = /^[a-z]{2,3}-r(?:[A-Z]{2}|\d{3})$/;

function localeFromAndroidDir(name, source) {
  if (name === 'values') return source;
  if (!name.startsWith('values-')) return null;
  const qualifier = name.slice('values-'.length);
  let tag;
  if (qualifier.startsWith('b+')) tag = qualifier.slice(2).replaceAll('+', '-');
  else if (ANDROID_LANGUAGE.test(qualifier)) tag = qualifier;
  else if (ANDROID_LANGUAGE_REGION.test(qualifier))
    tag = qualifier.replace('-r', '-');
  else return null;
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
