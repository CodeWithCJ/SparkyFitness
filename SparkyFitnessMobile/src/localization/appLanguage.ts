import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppLanguageNative } from '../services/appLanguageNative';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';
import i18n, {
  getDeviceLanguage,
  initializeI18n,
  type LanguagePreference,
  type SupportedLanguage,
} from './i18n';

/**
 * Stable, versioned marker that records whether the one-time migration that
 * seeds the Android 13+ platform app language from the stored preference has
 * completed. It applies only where native per-app language support exists
 * (Android 13+); on Android <=12 and iOS there is no native migration. Kept
 * outside the persisted preferences model so it never resets other user
 * preferences and never depends on translated text.
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
 * Maps an Android application-language tag to the store's preference model.
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

/**
 * Resolves the effective system language. On Android 13+ the native effective
 * locale is preferred; a rejected native read (or an unsupported value) falls
 * back to expo-localization's device locale and is logged. Never rejects.
 */
async function resolveSystemLanguage(): Promise<SupportedLanguage> {
  if (!AppLanguageNative.supportsNativePerAppLanguage) return getDeviceLanguage();
  try {
    const native = await AppLanguageNative.getEffectiveLanguage();
    return normalizeNativeLanguage(native) ?? getDeviceLanguage();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[AppLanguage] Failed to read native effective language: ${message}`, 'WARNING');
    return getDeviceLanguage();
  }
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
 * Ensures the Android 13+ platform application locale reflects `target`.
 * Skips the native write when the platform already reports the desired value,
 * which avoids an Activity recreation and a store/native ping-pong.
 */
async function ensureNativeLanguage(target: LanguagePreference): Promise<void> {
  if (!AppLanguageNative.supportsNativePerAppLanguage) return;
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
 * Android 13+ native-authoritative path: the platform application locale is
 * read and adopted into the store and i18next without writing anything back to
 * Android. A rejected native read must not fail app bootstrap — it falls back
 * to the stored preference and is logged. An unsupported value is repaired to
 * system before being adopted.
 */
async function adoptNativeState(): Promise<SupportedLanguage> {
  let native: MappedNative;
  try {
    native = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[AppLanguage] Native application-language read failed; using stored preference: ${message}`,
      'WARNING',
    );
    const preference = normalizePreference(storePreference());
    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  }

  if (native === 'unsupported') {
    await ensureNativeLanguage('system');
    setStorePreference('system');
    return applyEffectiveLanguage(await resolveSystemLanguage());
  }

  setStorePreference(native);
  return applyEffectiveLanguage(native === 'system' ? await resolveSystemLanguage() : native);
}

/**
 * Initializes storage, seeds the Android 13+ platform app locale from the
 * stored preference exactly once, then resolves the effective locale before
 * navigation. On Android <=12 and iOS the stored preference is authoritative
 * and no native API is called.
 */
export function initializeAppLanguage(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();
    const preference = normalizePreference(storePreference());
    setStorePreference(preference);

    if (!AppLanguageNative.supportsNativePerAppLanguage) {
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
    // Before migration, the stored preference seeds the platform app locale.
    // The marker is written only after the native write succeeds, so a
    // mid-run failure never records a false completion and the migration
    // retries next launch.
    await ensureNativeLanguage(preference);
    const confirmed = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
    setStorePreference(confirmed === 'unsupported' ? 'system' : confirmed);
    await writeMigrationFinished();
  } catch (error) {
    // Keep startup resilient: fall back to the store preference and let the
    // marker remain unset so the migration is retried on the next bootstrap.
    const message = error instanceof Error ? error.message : String(error);
    await addLog(`[AppLanguage] Native language migration failed; will retry next launch: ${message}`, 'WARNING');
  }
  const effectivePreference = storePreference();
  return applyEffectiveLanguage(
    effectivePreference === 'system' ? await resolveSystemLanguage() : effectivePreference,
  );
}

/**
 * Applies the Settings selection. On Android 13+ the platform locale is
 * updated before the store/i18n; a failed native write rejects (the store keeps
 * its previous value) so the caller can surface an error. On Android <=12 and
 * iOS the selection is local to SparkyFitness.
 */
export function setAppLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    const normalized = normalizePreference(preference);

    if (AppLanguageNative.supportsNativePerAppLanguage) {
      try {
        await ensureNativeLanguage(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(`[AppLanguage] Native application-language write failed: ${message}`, 'ERROR');
        throw error;
      }
    }

    setStorePreference(normalized);
    return applyEffectiveLanguage(
      normalized === 'system' ? await resolveSystemLanguage() : normalized,
    );
  });
}

/**
 * Resynchronizes a language change made outside the app (Android 13+ App
 * Languages) on foreground. Native app locale is read and adopted into the
 * store; valid values are never written back to the platform during this read.
 */
export function syncAppLanguageFromSystem(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();

    if (!AppLanguageNative.supportsNativePerAppLanguage) {
      const preference = normalizePreference(storePreference());
      return applyEffectiveLanguage(
        preference === 'system' ? await resolveSystemLanguage() : preference,
      );
    }

    return adoptNativeState();
  });
}
