import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { AppLanguageNative } from '../services/appLanguageNative';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { addLog } from '../services/LogService';
import i18n, {
  getDeviceLanguage,
  getNativeIOSLanguage,
  initializeI18n,
  SUPPORTED_LANGUAGES,
  type LanguagePreference,
  type SupportedLanguage,
} from './i18n';

/**
 * Stable, versioned marker that records whether the one-time Android 13+
 * legacy-preference handoff has completed: the platform per-app language and
 * the stored local preference have been reconciled exactly once. It applies
 * only where native per-app language support exists (Android 13+); on Android
 * <=12 and iOS there is no native handoff. Kept outside the persisted
 * preferences model so it never resets other user preferences and never depends
 * on translated text.
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
 * which avoids an Activity recreation and a store/native ping-pong. Rejects if
 * the platform cannot be brought to `target`.
 */
async function ensureNativeLanguage(target: LanguagePreference): Promise<void> {
  if (!AppLanguageNative.supportsNativePerAppLanguage) return;
  const current = mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
  const targetValue = target === 'system' ? null : target;
  if (current === target) return;
  await AppLanguageNative.setApplicationLanguage(targetValue);
}

/**
 * Reads the current native application language. On Android 13+ with the
 * module registered this returns the platform value; on any other platform it
 * reports `system`. An unreadable or unsupported platform value maps to
 * `'unsupported'` so callers never write an invalid value into the store.
 * A rejected native read propagates; every caller must handle it and must not
 * overwrite native state it could not read.
 */
async function readNativePreference(): Promise<MappedNative> {
  if (!AppLanguageNative.supportsNativePerAppLanguage) return 'system';
  return mapNativeToPreference(await AppLanguageNative.getApplicationLanguage());
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
    native = await readNativePreference();
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
    // An unsupported value must never be written into the store. Repair the
    // platform to system (best-effort) and fall back to the device locale.
    try {
      await ensureNativeLanguage('system');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await addLog(
        `[AppLanguage] Could not repair unsupported native locale to system: ${message}`,
        'WARNING',
      );
    }
    setStorePreference('system');
    return applyEffectiveLanguage(await resolveSystemLanguage());
  }

  setStorePreference(native);
  return applyEffectiveLanguage(native === 'system' ? await resolveSystemLanguage() : native);
}

/**
 * Initializes storage, then resolves the platform-authoritative locale before
 * navigation. Android 13+ reconciles LocaleManager exactly once; Android <=12
 * uses the local fallback. iOS reads the OS-owned per-app locale and treats a
 * persisted language value only as a legacy mirror, never as an override.
 */
export function initializeAppLanguage(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();

    // iOS owns the per-app language in Settings. The persisted preference is a
    // legacy mirror only and must never override, or be rewritten as, the
    // native value.
    if (Platform.OS === 'ios') {
      try {
        const language = getNativeIOSLanguage();
        if (storePreference() !== 'system') setStorePreference('system');
        return applyEffectiveLanguage(language);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(
          `[AppLanguage] iOS native locale read failed; using English for this launch: ${message}`,
          'WARNING',
        );
        return applyEffectiveLanguage('en');
      }
    }

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

/**
 * One-time Android 13+ legacy-preference handoff. Reads the platform app
 * language FIRST so a language the user already selected in Android Settings
 * wins; the legacy stored preference only seeds the platform when Android is
 * still following System. The marker is written only after a successful
 * handoff so a failed migration retries next launch.
 *
 * Flow (single owner, serialized by the caller):
 *   read native
 *     ├─ explicit en/pl  → adopt native + mark migrated (no write)
 *     ├─ system, stored explicit en/pl → seed native + confirm + mark
 *     ├─ system, stored system → no write + mark
 *     └─ read failed → local fallback for this startup, marker ABSENT (retry)
 */
async function runMigration(storedPreference: LanguagePreference): Promise<SupportedLanguage> {
  let native: MappedNative;
  try {
    native = await readNativePreference();
  } catch (error) {
    // We could not establish the native state, so we must NOT overwrite it.
    // Use the stored preference locally for this startup; the marker stays
    // absent and the migration retries next launch.
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[AppLanguage] Migration could not read native language; using stored preference and retrying next launch: ${message}`,
      'WARNING',
    );
    const preference = normalizePreference(storePreference());
    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  }

  if (native === 'unsupported') {
    // Do not write an unsupported value into the store. Repair the platform to
    // system (best-effort), then keep the stored preference.
    try {
      await ensureNativeLanguage('system');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await addLog(
        `[AppLanguage] Migration could not repair unsupported native locale: ${message}`,
        'WARNING',
      );
    }
    await writeMigrationFinished();
    const preference = normalizePreference(storePreference());
    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  }

  if (native === 'system') {
    // Platform follows System: a legacy explicit preference seeds it exactly
    // once (cases C/D); system/system performs no needless write (case E).
    if (storedPreference !== 'system') {
      try {
        await ensureNativeLanguage(storedPreference);
        const confirmed = await readNativePreference();
        const confirmedPreference =
          confirmed === 'unsupported' ? 'system' : confirmed;
        setStorePreference(confirmedPreference);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(
          `[AppLanguage] Migration seed failed; will retry next launch: ${message}`,
          'WARNING',
        );
        // Marker stays absent; local fallback preserved below.
        const preference = normalizePreference(storePreference());
        return applyEffectiveLanguage(
          preference === 'system' ? await resolveSystemLanguage() : preference,
        );
      }
    }
    await writeMigrationFinished();
    const preference = normalizePreference(storePreference());
    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  }

  // Native is explicit en/pl (cases A/B): the user's Android Settings choice
  // wins over the legacy store value. No native write.
  setStorePreference(native);
  await writeMigrationFinished();
  return applyEffectiveLanguage(native);
}

/**
 * Applies the Settings selection transactionally: if any step fails, the
 * previous store/native/i18n state is restored (best-effort) so the layers can
 * never knowingly contradict each other.
 *
 * Android 13+: snapshot previous native → write requested native → apply i18n
 * → commit store LAST. A failed i18n apply rolls the native value back.
 * Android <=12: apply i18n → commit store LAST (no native call). iOS has no
 * public setter; it only re-reads the OS-owned locale and leaves the mirror
 * normalized to `system`.
 */
export function setAppLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    const normalized = normalizePreference(preference);
    if (Platform.OS === 'ios') {
      // There is no public iOS setter. A selection cannot become authoritative;
      // callers should open Settings instead and wait for a native re-read.
      return applyEffectiveLanguage(getNativeIOSLanguage());
    }
    const previousStore = normalizePreference(storePreference());
    const resolvedLanguage = i18n.resolvedLanguage;
    const previousEffective: SupportedLanguage | undefined =
      resolvedLanguage && (SUPPORTED_LANGUAGES as readonly string[]).includes(resolvedLanguage)
        ? (resolvedLanguage as SupportedLanguage)
        : undefined;

    if (AppLanguageNative.supportsNativePerAppLanguage) {
      let previousNative: MappedNative | undefined;
      try {
        previousNative = await readNativePreference();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(`[AppLanguage] Could not snapshot native language: ${message}`, 'WARNING');
      }

      try {
        await ensureNativeLanguage(normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(`[AppLanguage] Native application-language write failed: ${message}`, 'ERROR');
        throw error;
      }

      try {
        const effective = await applyEffectiveLanguage(
          normalized === 'system' ? await resolveSystemLanguage() : normalized,
        );
        setStorePreference(normalized);
        return effective;
      } catch (error) {
        // i18n apply failed after a successful native write: roll the native
        // value back best-effort, then reconcile the store/i18n to reality.
        const message = error instanceof Error ? error.message : String(error);
        await addLog(`[AppLanguage] i18n apply failed; rolling back native: ${message}`, 'ERROR');
        await rollbackNativeLanguage(previousNative, previousStore, previousEffective);
        throw error;
      }
    }

    // Android <=12 / iOS: local-only. Commit the store only after i18n applies.
    try {
      const effective = await applyEffectiveLanguage(
        normalized === 'system' ? await resolveSystemLanguage() : normalized,
      );
      setStorePreference(normalized);
      return effective;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await addLog(`[AppLanguage] i18n apply failed; store unchanged: ${message}`, 'ERROR');
      throw error;
    }
  });
}

/**
 * Best-effort restoration after a failed language change on Android 13+.
 * Restores the previous native value, then reconciles the store and the
 * effective i18n language to the actual state so the layers never knowingly
 * contradict each other. If the native rollback itself fails, the real native
 * state is re-read and adopted.
 */
async function rollbackNativeLanguage(
  previousNative: MappedNative | undefined,
  previousStore: LanguagePreference,
  previousEffective: SupportedLanguage | undefined,
): Promise<void> {
  try {
    if (previousNative !== undefined && previousNative !== 'unsupported') {
      await ensureNativeLanguage(previousNative);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[AppLanguage] Native rollback failed (${message}); reconciling to actual state`,
      'ERROR',
    );
  }

  try {
    const actual = await readNativePreference();
    if (actual === 'unsupported') {
      // Unsupported value: never write it into the store; repair to system.
      try {
        await ensureNativeLanguage('system');
      } catch (repairError) {
        const repairMessage =
          repairError instanceof Error ? repairError.message : String(repairError);
        await addLog(
          `[AppLanguage] Could not repair native locale after rollback: ${repairMessage}`,
          'ERROR',
        );
      }
      setStorePreference('system');
      await applyEffectiveLanguage(await resolveSystemLanguage());
      return;
    }

    // Reconcile store + i18n to the ACTUAL native state (which may be the
    // previous value or something the platform decided independently).
    setStorePreference(actual);
    await applyEffectiveLanguage(actual === 'system' ? await resolveSystemLanguage() : actual);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await addLog(
      `[AppLanguage] Post-rollback reconciliation failed; restoring stored preference: ${message}`,
      'ERROR',
    );
    setStorePreference(previousStore);
    if (previousEffective) {
      try {
        await applyEffectiveLanguage(previousEffective);
      } catch (applyError) {
        const applyMessage =
          applyError instanceof Error ? applyError.message : String(applyError);
        await addLog(
          `[AppLanguage] Could not restore effective language after rollback: ${applyMessage}`,
          'ERROR',
        );
      }
    }
  }
}

/**
 * Resynchronizes a language change made outside the app (Android 13+ App
 * Languages) on foreground. Native app locale is read and adopted into the
 * store; valid values are never written back to the platform during this read.
 */
export function syncAppLanguageFromSystem(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();

    if (Platform.OS === 'ios') {
      try {
        if (storePreference() !== 'system') setStorePreference('system');
        return applyEffectiveLanguage(getNativeIOSLanguage());
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await addLog(
          `[AppLanguage] iOS foreground locale read failed; language unchanged for this read: ${message}`,
          'WARNING',
        );
        return applyEffectiveLanguage('en');
      }
    }

    if (!AppLanguageNative.supportsNativePerAppLanguage) {
      const preference = normalizePreference(storePreference());
      return applyEffectiveLanguage(
        preference === 'system' ? await resolveSystemLanguage() : preference,
      );
    }

    return adoptNativeState();
  });
}
