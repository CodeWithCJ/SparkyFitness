/**
 * Optional features (#3487): whole features a person can turn on or off in
 * Settings -> Features, separately for the website and for the mobile app.
 *
 * This registry is the only list of optional features. Defaults live here and
 * nowhere else: the server stores only the choices a person made explicitly
 * (`user_preferences.feature_choices`, one map per platform), so a missing key
 * means "the default", and a feature can ship off by default without a
 * migration. Add a key here together with its gates on web and mobile: each
 * app's Features screen lists every key, and a switch that hides nothing would
 * mislead.
 *
 * Turning a feature off in one app leaves the other alone. The finer per-place
 * settings (the web tabs, Customize layout, the mobile dashboard and + menu)
 * still apply while a feature is on, and are kept while it is off.
 *
 * The switch hides UI only. No route, importer, sync or MCP tool checks it.
 * Labels and descriptions live in each app's locale files, keyed by these ids.
 */
import { z } from 'zod';

/**
 * Where a choice applies. `web` is the website on any screen, a phone browser
 * included. `mobile` is the native app and what it drives (the watch pages,
 * widgets and reminders). Not the nutrient display `platform` values, where
 * "mobile" means a narrow web screen.
 */
export const FEATURE_PLATFORMS = ['web', 'mobile'] as const;
export type FeaturePlatform = (typeof FEATURE_PLATFORMS)[number];

export const FEATURE_GROUPS = [
  'health',
  'nutrition',
  'training',
  'wellbeing',
] as const;
export type FeatureGroup = (typeof FEATURE_GROUPS)[number];

/**
 * Where a feature's on/off value lives: `choices` is
 * `user_preferences.feature_choices`; `cycleSettings` is
 * `cycle_settings.enabled`, which cycle tracking already had, so the two can
 * never disagree.
 */
export type FeatureStorage = 'choices' | 'cycleSettings';

interface FeatureDefinition {
  group: FeatureGroup;
  defaultEnabled: boolean;
  storage: FeatureStorage;
}

export const OPTIONAL_FEATURES = {
  cycle: { group: 'health', defaultEnabled: false, storage: 'cycleSettings' },
} as const satisfies Record<string, FeatureDefinition>;

export type FeatureKey = keyof typeof OPTIONAL_FEATURES;

export const FEATURE_KEYS = Object.keys(OPTIONAL_FEATURES) as FeatureKey[];

export function isFeatureKey(value: string): value is FeatureKey {
  return Object.hasOwn(OPTIONAL_FEATURES, value);
}

/** The registry entry with its fields widened, so code reading it does not
 * depend on which literal values the current entries happen to have. */
function featureDefinition(key: FeatureKey): FeatureDefinition {
  return OPTIONAL_FEATURES[key];
}

export function featureStorage(key: FeatureKey): FeatureStorage {
  return featureDefinition(key).storage;
}

/** Most keys one platform's choices may hold, per patch and stored. */
export const MAX_FEATURE_CHOICES = 64;

// Well-formed keys this build does not know are kept, so a newer app can store
// its choices on a server that predates them.
const featureChoiceKeySchema = z.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/);

// Registry features switched somewhere else (cycle: `cycle_settings.enabled`).
// The column's CHECK keeps them out, so the stored schema refuses them too.
const featuresStoredElsewhere = FEATURE_KEYS.filter(
  (key) => featureStorage(key) !== 'choices'
);

/** One platform's explicit choices: a missing key means the registry default. */
export const platformFeatureChoicesSchema = z
  .record(featureChoiceKeySchema, z.boolean())
  .refine(
    (choices) =>
      Object.keys(choices).length <= MAX_FEATURE_CHOICES &&
      !featuresStoredElsewhere.some((key) => Object.hasOwn(choices, key))
  );
export type PlatformFeatureChoices = z.infer<
  typeof platformFeatureChoicesSchema
>;

/** The stored choices, per platform. A missing platform has no choices yet. */
export const featureChoicesSchema = z.object({
  web: platformFeatureChoicesSchema.optional(),
  mobile: platformFeatureChoicesSchema.optional(),
});
export type FeatureChoices = z.infer<typeof featureChoicesSchema>;

/** A change to one platform: true or false sets a key, null resets it to its
 * default. Only the keys sent change. */
const platformFeatureChoicesPatchSchema = z
  .record(featureChoiceKeySchema, z.boolean().nullable())
  .refine((patch) => {
    const count = Object.keys(patch).length;
    return count >= 1 && count <= MAX_FEATURE_CHOICES;
  });

/** A change to one platform or both, e.g. `{ mobile: { medications: false } }`.
 * Any other key is refused, so a body without platforms (the first draft's
 * shape) is never read as one. */
export const featureChoicesPatchSchema = z
  .strictObject({
    web: platformFeatureChoicesPatchSchema.optional(),
    mobile: platformFeatureChoicesPatchSchema.optional(),
  })
  .refine((patch) => patch.web !== undefined || patch.mobile !== undefined);
export type FeatureChoicesPatch = z.infer<typeof featureChoicesPatchSchema>;

/** What the on/off values are read from. */
export interface FeatureSources {
  choices: FeatureChoices | null | undefined;
  /** `cycle_settings.enabled`; null or undefined when there is no row or it
   * cannot be read (cycle settings are owner-only, so always for someone acting
   * on the owner's behalf). */
  cycleEnabled: boolean | null | undefined;
}

/** Whether the feature shows in this app. */
export function isFeatureEnabled(
  key: FeatureKey,
  platform: FeaturePlatform,
  sources: FeatureSources
): boolean {
  const feature = featureDefinition(key);
  if (feature.storage === 'cycleSettings') {
    return sources.cycleEnabled === true;
  }
  return sources.choices?.[platform]?.[key] ?? feature.defaultEnabled;
}

/**
 * On in at least one app. For answers that are not about one app's screens,
 * such as what someone acting for the person sees, or server-side behaviour.
 */
export function isFeatureEnabledAnywhere(
  key: FeatureKey,
  sources: FeatureSources
): boolean {
  return FEATURE_PLATFORMS.some((platform) =>
    isFeatureEnabled(key, platform, sources)
  );
}

/**
 * Turned off by the person, not merely off by default. For cycle that is a
 * `cycle_settings` row with `enabled = false`; no row means cycle was never set
 * up. Things that existed before the switch (a reproductive category synced
 * from Health, a footnote) react to this, so nothing disappears for someone
 * who never chose anything.
 */
export function isFeatureExplicitlyOff(
  key: FeatureKey,
  platform: FeaturePlatform,
  sources: FeatureSources
): boolean {
  if (featureDefinition(key).storage === 'cycleSettings') {
    return sources.cycleEnabled === false;
  }
  return sources.choices?.[platform]?.[key] === false;
}

/** Keeps the items with no feature, and those whose feature is on. */
export function filterByFeature<T extends { feature?: FeatureKey }>(
  items: readonly T[],
  isEnabled: (key: FeatureKey) => boolean
): T[] {
  return items.filter(
    (item) => item.feature === undefined || isEnabled(item.feature)
  );
}

/**
 * Custom measurement categories that belong to a feature. Cycle: the
 * reproductive data HealthKit and Health Connect sync stores as custom
 * measurements. Consumers hide them only when the feature is explicitly off.
 */
export const FEATURE_CUSTOM_CATEGORIES: Partial<
  Record<FeatureKey, readonly string[]>
> = {
  cycle: [
    'menstruation_flow',
    'menstruation_period',
    'ovulation_test',
    'cervical_mucus',
    'intermenstrual_bleeding',
  ],
};
