package com.sparkyapps.sparkyfitness.language

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import androidx.annotation.DoNotInline
import androidx.annotation.RequiresApi

/**
 * Isolated Android 13+ (API 33+) helper for the platform per-app language API
 * (`android.app.LocaleManager` / `applicationLocales`).
 *
 * This object is the ONLY place on the language bridge path that references
 * `android.app.LocaleManager`. It is loaded lazily by `AppLanguageModule`
 * only after a runtime `Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU`
 * check, so the class verifier on Android <=12 never resolves `LocaleManager`
 * and cannot raise `NoClassDefFoundError` / `VerifyError` during module
 * registration.
 *
 * `@RequiresApi` marks the boundary for lint; `@DoNotInline` + `@JvmStatic`
 * follow the AndroidX out-of-line pattern so the R8/ART verifier does not inline
 * these bodies back into the common caller (which would re-introduce the API
 * 33 class reference on the minSdk path).
 *
 * No method exposes `LocaleManager` across the helper boundary: callers receive
 * only primitive/String values that are safe on every API level.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal object AppLanguageApi33 {
    private fun localeManager(context: Context): LocaleManager? =
        context.getSystemService(Context.LOCALE_SERVICE) as? LocaleManager

    @JvmStatic
    @DoNotInline
    fun setApplicationLanguage(context: Context, languageTags: String?) {
        val locales = if (languageTags.isNullOrEmpty()) {
            LocaleList.getEmptyLocaleList()
        } else {
            LocaleList.forLanguageTags(languageTags)
        }
        localeManager(context)?.applicationLocales = locales
    }

    @JvmStatic
    @DoNotInline
    fun getApplicationLanguage(context: Context): String? =
        localeManager(context)?.applicationLocales?.toLanguageTags()

    /**
     * Returns the platform application locale tag (API 33+ only), or null when
     * the platform reports an empty list. The caller is responsible for the
     * non-API-33 fallback (`configuration.locales[0]` / `Locale.getDefault()`).
     */
    @JvmStatic
    @DoNotInline
    fun getApplicationLanguageTag(context: Context): String? =
        localeManager(context)?.applicationLocales?.get(0)?.toLanguageTag()
}
