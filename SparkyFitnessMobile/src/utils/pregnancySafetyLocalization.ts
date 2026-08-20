import type { TFunction } from 'i18next';
import i18n from '../localization/i18n';
import type { SafetyItem } from '@workspace/shared';

const defaultTranslator: TFunction = i18n.t.bind(i18n);
function resolveTranslator(t?: TFunction): TFunction {
  return t ?? defaultTranslator;
}

/**
 * Localized Polish search aliases per controlled safety item. Kept here (not in
 * the translation JSON) so EN and PL catalogs stay structurally mirror-symmetric.
 */
const PL_ALIASES: Record<string, string[]> = {
  cooked_salmon: ['łosoś', 'ryba'],
  tuna_canned_light: ['tuńczyk', 'tuńczyk w puszce'],
  swordfish: ['miecznik', 'rekin', 'królewski makrela', 'marlin'],
  sushi_raw: ['sushi', 'sashimi', 'surowa ryba', 'sushi raw'],
  shrimp_cooked: ['krewetki', 'owoce morza'],
  soft_cheese_unpasteurized: ['ser miękki', 'brie', 'feta', 'camembert', 'ser pleśniowy', 'ser'],
  hard_cheese: ['ser twardy', 'cheddar', 'parmezan', 'ser'],
  pasteurized_milk: ['mleko', 'mleko pasteryzowane'],
  deli_meat_cold: ['wędliny', 'wędlina', 'szynka', 'wędliny na zimno', 'mięso na zimno'],
  undercooked_meat: ['surowa wołowina', 'niedogotowane mięso', 'surowa ryba', 'mięso'],
  cooked_chicken: ['kurczak', 'drób'],
  runny_raw_eggs: ['jajka', 'jajko', 'surowe jajka'],
  coffee: ['kawa', 'kofeina', 'espresso'],
  alcohol: ['alkohol', 'wino', 'piwo', 'mocny alkohol'],
  herbal_tea: ['herbata ziołowa', 'herbatka', 'herbata'],
  cooked_leafy_greens: ['szpinak', 'jarmuż', 'warzywa', 'zielone warzywa'],
  unwashed_produce: ['kiełki', 'niemyte owoce', 'niemyte warzywa', 'surowe kiełki'],
  liver_pate: ['wątróbka', 'pasztet'],
  peanuts: ['orzeszki', 'orzechy', 'arachidowe'],
  honey: ['miód'],
  acetaminophen: ['paracetamol', 'tylenol', 'acetaminofen'],
  ibuprofen: ['ibuprofen', 'advil', 'niesteroidowe leki przeciwzapalne', 'nimesulid', 'motrin'],
  aspirin: ['aspiryna', 'kwas acetylosalicylowy'],
  prenatal_vitamin: ['witamina prenatalna', 'kwas foliowy', 'witamina dla ciężarnych'],
  antacids_tums: ['tums', 'węglan wapnia', 'lek zobojętniający', 'zgaga'],
  diphenhydramine: ['benadryl', 'difenhydramina', 'lek antyhistaminowy'],
  ibuprofen_gel: ['ibuprofen żel', 'żel przeciwzapalny', 'topikalne nsaid'],
  isotretinoin: ['izotretynoina', 'accutane', 'retinoid'],
  pseudoephedrine: ['pseudoefedryna', 'sudafed', 'lek na katar', 'na zatkany nos'],
  vitamin_a_high_dose: ['witamina a', 'retinol', 'retinolowa'],
};

/** The controlled group namespace for a safety item. */
function safetyKey(item: SafetyItem, list: 'food' | 'med'): string {
  return `pregnancy.safety.${list}.${item.key || ''}`;
}

/** Localized presentation name for a controlled safety item. */
export function localizeSafetyName(item: SafetyItem, list: 'food' | 'med', t?: TFunction): string {
  const translate = resolveTranslator(t);
  const key = safetyKey(item, list);
  return translate(`${key}.name`, { defaultValue: item.name });
}

/** Localized explanatory note for a controlled safety item. */
export function localizeSafetyNote(item: SafetyItem, list: 'food' | 'med', t?: TFunction): string {
  const translate = resolveTranslator(t);
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
export function lookupSafetyLocalized(
  query: string,
  list: readonly SafetyItem[],
  group: 'food' | 'med',
  t?: TFunction,
): SafetyItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const translate = resolveTranslator(t);
  return list.filter((item) => {
    if (!item.key) {
      return (
        item.name.toLowerCase().includes(q) ||
        item.aliases.some((a) => a.toLowerCase().includes(q))
      );
    }
    if (item.name.toLowerCase().includes(q)) return true;
    if (item.aliases.some((a) => a.toLowerCase().includes(q))) return true;
    const localizedName = localizeSafetyName(item, group, translate).toLowerCase();
    if (localizedName.includes(q)) return true;
    const plAliases = PL_ALIASES[item.key] ?? [];
    if (plAliases.some((a) => a.toLowerCase().includes(q))) return true;
    return false;
  });
}
