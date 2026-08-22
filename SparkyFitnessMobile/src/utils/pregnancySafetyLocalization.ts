import type { TFunction } from 'i18next';
import type { SafetyItem } from '@workspace/shared';


/**
 * Localized Polish search aliases per controlled safety item. Kept here (not in
 * the translation JSON) so EN and PL catalogs stay structurally mirror-symmetric.
 */
const PL_ALIASES: Record<string, string[]> = {
  // Specific aliases only; broad category words such as "ryba"/"ser"/"mięso"/
  // "warzywa"/"herbata" are deliberately excluded so a generic query does not
  // imply one specific controlled safety item.
  cooked_salmon: ['łosoś'],
  tuna_canned_light: ['tuńczyk', 'tuńczyk w puszce'],
  swordfish: ['miecznik', 'rekin', 'makrela królewska', 'marlin'],
  sushi_raw: ['sushi', 'sashimi', 'surowa ryba', 'sushi raw'],
  shrimp_cooked: ['krewetki'],
  soft_cheese_unpasteurized: ['ser miękki', 'brie', 'feta', 'camembert', 'ser pleśniowy'],
  hard_cheese: ['ser twardy', 'cheddar', 'parmezan'],
  pasteurized_milk: ['mleko pasteryzowane'],
  deli_meat_cold: ['wędliny', 'wędlina', 'szynka', 'wędliny na zimno', 'mięso na zimno'],
  undercooked_meat: ['surowa wołowina', 'niedogotowane mięso'],
  cooked_chicken: ['kurczak', 'drób'],
  runny_raw_eggs: ['jajka', 'jajko', 'surowe jajka'],
  coffee: ['kawa', 'kofeina', 'espresso'],
  alcohol: ['alkohol', 'wino', 'piwo', 'mocny alkohol'],
  herbal_tea: ['herbata ziołowa', 'herbatka'],
  cooked_leafy_greens: ['szpinak', 'jarmuż', 'zielone warzywa'],
  unwashed_produce: ['kiełki', 'niemyte owoce', 'niemyte warzywa', 'surowe kiełki'],
  liver_pate: ['wątróbka', 'pasztet'],
  peanuts: ['orzeszki', 'arachidowe'],
  honey: ['miód'],
  acetaminophen: ['paracetamol', 'tylenol', 'acetaminofen'],
  ibuprofen: ['ibuprofen', 'advil', 'motrin'],
  aspirin: ['aspiryna', 'kwas acetylosalicylowy'],
  prenatal_vitamin: ['witamina prenatalna', 'kwas foliowy', 'witamina dla ciężarnych'],
  antacids_tums: ['tums', 'węglan wapnia', 'lek zobojętniający'],
  diphenhydramine: ['benadryl', 'difenhydramina'],
  ibuprofen_gel: ['ibuprofen żel', 'żel przeciwzapalny'],
  isotretinoin: ['izotretynoina', 'accutane', 'retinoid'],
  pseudoephedrine: ['pseudoefedryna', 'sudafed', 'lek na przekrwienie'],
  vitamin_a_high_dose: ['witamina a', 'retinol'],
};

/** The controlled group namespace for a safety item. */
function safetyKey(item: SafetyItem, list: 'food' | 'med'): string {
  return `pregnancy.safety.${list}.${item.key || ''}`;
}

/** Localized presentation name for a controlled safety item. */
export function localizeSafetyName(item: SafetyItem, list: 'food' | 'med', t: TFunction): string {
  const translate = t;
  const key = safetyKey(item, list);
  return translate(`${key}.name`, { defaultValue: item.name });
}

/** Localized explanatory note for a controlled safety item. */
export function localizeSafetyNote(item: SafetyItem, list: 'food' | 'med', t: TFunction): string {
  const translate = t;
  const key = safetyKey(item, list);
  return translate(`${key}.note`, { defaultValue: item.note });
}

/**
 * Localized safety search across the controlled FOOD_SAFETY / MED_SAFETY lists.
 * Matches a query against BOTH canonical English (name + aliases) and localized
 * PL name + PL search aliases, so a Polish user can search "łosoś" or "ser".
 * The canonical lookupSafety() remains the shared/English contract; this is the
 * mobile presentation/search layer.
 */
/**
 * Strips common Polish inflectional suffixes from a lowercase word token so
 * case-inflected search terms still match their canonical (nominative) aliases,
 * e.g. "surową" -> "surow", "rybę" -> "ryb", "łososią" -> "łosos".
 */
function stemPolish(word: string): string {
  let w = word.toLowerCase().trim();
  if (w.length <= 3) return w;
  const suffixes = ['iami', 'owej', 'owych', 'owie', 'ami', 'ach', 'emu', 'ego',
    'ymi', 'iem', 'yck', 'ego', 'ości', 'cie', 'ną', 'em', 'ów', 'om', 'mi',
    'ie', 'ej', 'ą', 'ę', 'a', 'u', 'y', 'i', 'o', 'e'];
  for (const suf of suffixes) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      return w.slice(0, w.length - suf.length);
    }
  }
  return w;
}

/** Splits a phrase into lowercased tokens and their Polish stems. */
function stemPhrase(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[^a-ząćęłńóśźż]+/i)
    .filter((t) => t.length > 0)
    .map(stemPolish);
}

/**
 * Conservative alias match for Polish search. An alias matches when every alias
 * token stem is present in the normalized query's stem set. This handles longer
 * natural questions ("czy mogę jeść surową rybę" -> "surowa ryba") and Polish
 * case inflection, while a broad single category word ("mięso") cannot imply a
 * multi-word item ("niedogotowane mięso") because the extra words are not in the
 * query. Falls back to plain substring matching for English aliases.
 */
/** English canonical alias: plain substring matching (with phrase support). */
function englishAliasMatches(alias: string, q: string): boolean {
  const a = alias.toLowerCase();
  return a.includes(q) || q.includes(a);
}

/** Polish alias: stem-based conservative match (handles inflection + longer queries). */
function plAliasMatches(alias: string, q: string): boolean {
  const aliasStems = stemPhrase(alias);
  if (aliasStems.length === 0) return false;
  const queryStems = new Set(stemPhrase(q));
  return aliasStems.every((st) => queryStems.has(st));
}

/**
 * Localized safety search across the controlled FOOD_SAFETY / MED_SAFETY lists.
 * Matches a query against BOTH canonical English (name + aliases) and localized
 * PL name + precise PL search aliases, so a Polish user can search "łosoś",
 * "surowa ryba", or a natural longer phrase containing a precise term. The
 * canonical lookupSafety() remains the shared/English contract; this is the
 * mobile presentation/search layer.
 */
export function lookupSafetyLocalized(
  query: string,
  list: readonly SafetyItem[],
  group: 'food' | 'med',
  t: TFunction,
): SafetyItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list.filter((item) => {
    if (!item.key) {
      // Items without a key are not part of the controlled set; keep canonical
      // English matching only.
      return (
        item.name.toLowerCase().includes(q) ||
        item.aliases.some((a) => englishAliasMatches(a, q))
      );
    }
    if (englishAliasMatches(item.name, q)) return true;
    if (item.aliases.some((a) => englishAliasMatches(a, q))) return true;
    const plAliases = PL_ALIASES[item.key] ?? [];
    if (plAliases.some((a) => plAliasMatches(a, q))) return true;
    return false;
  });
}
