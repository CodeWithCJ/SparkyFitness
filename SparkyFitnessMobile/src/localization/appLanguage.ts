import { AppLanguageNative } from '../services/appLanguageNative';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import i18n, {
  getDeviceLanguage,
  initializeI18n,
  type LanguagePreference,
  type SupportedLanguage,
} from './i18n';

export type NativeLanguageValue = SupportedLanguage | null;

function normalizePreference(value: unknown): LanguagePreference {
  return value === 'en' || value === 'pl' || value === 'system' ? value : 'system';
}

function normalizeNativeLanguage(value: string | null): SupportedLanguage | null {
  const language = value?.toLowerCase().split('-')[0];
  return language === 'en' || language === 'pl' ? language : null;
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

async function resolveSystemLanguage(): Promise<SupportedLanguage> {
  const nativeEffective = AppLanguageNative.isAvailable
    ? normalizeNativeLanguage(await AppLanguageNative.getEffectiveLanguage())
    : null;
  return nativeEffective ?? getDeviceLanguage();
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

/** Initializes storage, Android application locale, and i18next before navigation. */
export function initializeAppLanguage(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();
    const preference = normalizePreference(useAppPreferencesStore.getState().languagePreference);
    if (preference !== useAppPreferencesStore.getState().languagePreference) {
      useAppPreferencesStore.getState().setLanguagePreference(preference);
    }

    if (AppLanguageNative.isAvailable) {
      await AppLanguageNative.setApplicationLanguage(preference === 'system' ? null : preference);
    }

    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  });
}

/** Applies the Settings selection and keeps Android AppCompat in sync. */
export function setAppLanguagePreference(
  preference: LanguagePreference,
): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    const normalized = normalizePreference(preference);
    useAppPreferencesStore.getState().setLanguagePreference(normalized);

    if (AppLanguageNative.isAvailable) {
      await AppLanguageNative.setApplicationLanguage(normalized === 'system' ? null : normalized);
    }

    return applyEffectiveLanguage(
      normalized === 'system' ? await resolveSystemLanguage() : normalized,
    );
  });
}

/** Resynchronizes system/AppCompat changes without creating a store/native loop. */
export function syncAppLanguageFromSystem(): Promise<SupportedLanguage> {
  return serializeLanguageOperation(async () => {
    await hydratePreferences();
    const preference = normalizePreference(useAppPreferencesStore.getState().languagePreference);

    if (!AppLanguageNative.isAvailable) {
      return preference === 'system'
        ? applyEffectiveLanguage(await resolveSystemLanguage())
        : applyEffectiveLanguage(preference);
    }

    const rawNativeApplication = await AppLanguageNative.getApplicationLanguage();
    const nativeApplication = normalizeNativeLanguage(rawNativeApplication);

    if (rawNativeApplication !== null && nativeApplication === null) {
      await AppLanguageNative.setApplicationLanguage(null);
      return preference === 'system'
        ? applyEffectiveLanguage(await resolveSystemLanguage())
        : applyEffectiveLanguage(preference);
    }

    if (nativeApplication !== null && nativeApplication !== preference) {
      useAppPreferencesStore.getState().setLanguagePreference(nativeApplication);
      return applyEffectiveLanguage(nativeApplication);
    }

    if (preference !== 'system' && nativeApplication === null) {
      await AppLanguageNative.setApplicationLanguage(preference);
      return applyEffectiveLanguage(preference);
    }

    return applyEffectiveLanguage(
      preference === 'system' ? await resolveSystemLanguage() : preference,
    );
  });
}

export function getNativeApplicationLanguage(): Promise<NativeLanguageValue> {
  return AppLanguageNative.getApplicationLanguage().then(normalizeNativeLanguage);
}
