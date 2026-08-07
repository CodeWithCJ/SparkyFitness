import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppLanguageNative } from '../services/appLanguageNative';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import i18n, {
  getDeviceLanguage,
  initializeI18n,
  type LanguagePreference,
  type SupportedLanguage,
} from './i18n';

export type NativeLanguageValue = SupportedLanguage | null;

/**
 * Stable, versioned marker that records whether the one-time migration that
 * establishes AppCompat as an authoritative native source of truth has
 * completed. Kept outside the persisted preferences model so it never resets
 * other user preferences and never depends on translated text.
 */
const MIGRATION_STORAGE_KEY = '@SparkyFitness/app-language-migration';
const MIGRATION_VERSION = 1;

function normalizePreference(value: unknown): LanguagePreference {
  return value === 'en' || value === 'pl' || value === 'system' ? value : 'system';
}

function normalizeNativeLanguage(value: string | null | undefined): SupportedLanguage | null {
  const language = value?.toLowerCase().split('-')[0];
  return language === 'en' || language === 'pl' ? language : null;
}

/**
 * Maps an AppCompat application-language tag to the store's preference model.
 * An empty list (system) maps to `system`; `en`/`pl` map directly; anything
 * else is `unsupported` and must never be written to the store.
 */
type MappedNative = LanguagePreference | 'unsupported';
function mapNativeToPreference(raw: string | null): MappedNative {
  if (raw === null || raw === '') return 'system';
  return normalizeNativeLanguage(raw) ?? 'unsupported';
}

async function hydratePreferences(): Promise<void> {
  const persist = useAppPreferencesStore.persist;
  if (persist.hasHydrated()) return;

  await new Promise<void>((resolve) => {
    const unsubscribe = persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
    void persist.rehydrate();
  });
}

async function applyEffectiveLanguage(language: SupportedLanguage): Promise<SupportedLanguage> {
  await initializeI18n(language);
  if (i18n.resolvedLanguage !== language) {
    await i18n.changeLanguage(language);
  }
  return language;
}

function storePreference(): LanguagePreference {
  return useAppPreferencesStore.getState().languagePreference;
}

function setStorePreference(preference: LanguagePreference): void {
  if (storePreference() === preference) return;
  useAppPreferencesStore.getState().setLanguagePreference(preference);
}

async function resolveSystemLanguage(): Promise<SupportedLanguage> {
  if (!AppLanguageNative.isAvailable) return getDeviceLanguage();
  return normalizeNativeLanguage(await AppLanguageNative.getEffectiveLanguage()) ?? getDeviceLanguage();
}

let languageOperation: Promise<unknown> = Promise.resolve();

function serializeLanguageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const next = languageOperation.then(operation, operation);
  languageOperation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

/**
 * Ensures the Android application locales reflect `target`. Skips the native
 * write when AppCompat already reports the desired value, which avoids an
 * Activity recreation and a store/native ping-pong.
 */
async function ensureNativeLanguage(target: LanguagePreference): Promise<void> {
  if (!AppLanguageNative.isAvailable) return;
  const current = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
  const targetValue = target === 'system' ? null : target;
  if (current === target) return;
  await AppLanguageNative.setApplicationLanguage(targetValue);
}

async function readMigrationFinished(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(MIGRATION_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { version?: unknown };
    return parsed?.version === MIGRATION_VERSION;
  } catch {
    return false;
  }
}

async function writeMigrationFinished(): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_STORAGE_KEY, JSON.stringify({ version: MIGRATION_VERSION }));
}

/**
 * Android native-authoritative path: AppCompat application locales are read and
 * adopted into the store and i18next without writing anything back to Android.
 * An unsupported value is repaired to system before being adopted.
 */
async function adoptNativeState(): Promise<SupportedLanguage> {
  const native = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());

  if (native === 'unsupported') {
    await ensureNativeLanguage('system');
    setStorePreference('system');
    return applyEffectiveLanguage(await resolveSystemLanguage());
  }

  setStorePreference(native);
  return applyEffectiveLanguage(native === 'system' ? await resolveSystemLanguage() : native);
}

/**
 * Initializes storage, migrates the legacy store preference into AppCompat on
 * Android exactly once, then resolves the effective locale before navigation.
 */
export function initializeAppLanguage(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();
    const preference = normalizePreference(storePreference());
    setStorePreference(preference);

    if (!AppLanguageNative.isAvailable) {
      return applyEffectiveLanguage(
        preference === 'system' ? await resolveSystemLanguage() : preference,
      );
    }

    if (!(await readMigrationFinished())) {
      return runMigration(preference);
    }

    return adoptNativeState();
  });
}

async function runMigration(preference: LanguagePreference): Promise<SupportedLanguage> {
  try {
    // Before migration, the legacy store preference seeds AppCompat. The marker
    // is written only after the native write succeeds, so a mid-run failure
    // never records a false completion and the migration retries next launch.
    await ensureNativeLanguage(preference);
    const confirmed = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
    setStorePreference(confirmed === 'unsupported' ? 'system' : confirmed);
    await writeMigrationFinished();
  } catch {
    // Keep startup resilient: fall back to the store preference and let the
    // marker remain unset so the migration is retried on the next bootstrap.
  }
  const effectivePreference = storePreference();
  return applyEffectiveLanguage(
    effectivePreference === 'system' ? await resolveSystemLanguage() : effectivePreference,
  );
}

/** Applies the Settings selection, updating AppCompat before the store/i18n. */
export function setAppLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    const normalized = normalizePreference(preference);

    if (AppLanguageNative.isAvailable) {
      await ensureNativeLanguage(normalized);
    }

    setStorePreference(normalized);
    return applyEffectiveLanguage(
      normalized === 'system' ? await resolveSystemLanguage() : normalized,
    );
  });
}

/**
 * Resynchronizes a language change made outside the app (Android App Languages)
 * on foreground. Native app locale is read and adopted into the store; valid
 * values are never written back to AppCompat during this read.
 */
export function syncAppLanguageFromSystem(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();

    if (!AppLanguageNative.isAvailable) {
      const preference = normalizePreference(storePreference());
      return applyEffectiveLanguage(
        preference === 'system' ? await resolveSystemLanguage() : preference,
      );
    }

    return adoptNativeState();
  });
}

export async function getNativeApplicationLanguage(): Promise<NativeLanguageValue> {
  return AppLanguageNative.getApplicationLanguage().then(normalizeNativeLanguage);
}