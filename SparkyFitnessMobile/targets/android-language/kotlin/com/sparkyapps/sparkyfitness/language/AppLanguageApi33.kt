package com.sparkyapps.sparkyfitness.language

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
import androidx.annotation.RequiresApi
import java.util.Locale

/**
 * Isolated Android 13+ (API 33+) helper for the platform per-app language API
 * (`android.app.LocaleManager` / `applicationLocales`).
 *
 * This class is the ONLY place that references `android.app.LocaleManager`. It
 * is loaded lazily by `AppLanguageModule` only after a runtime
 * `Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU` check, so the class
 * verifier on Android <=12 never resolves `LocaleManager` and cannot raise
 * `NoClassDefFoundError` / `VerifyError` during module registration.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
internal object AppLanguageApi33 {
    fun localeManager(context: Context): LocaleManager? =
        context.getSystemService(Context.LOCALE_SERVICE) as? LocaleManager

    fun setApplicationLanguage(context: Context, languageTags: String?) {
        val locales = if (languageTags.isNullOrEmpty()) {
            LocaleList.getEmptyLocaleList()
        } else {
            LocaleList.forLanguageTags(languageTags)
        }
        localeManager(context)?.applicationLocales = locales
    }

    fun getApplicationLanguage(context: Context): String? =
        localeManager(context)?.applicationLocales?.toLanguageTags()

    fun getEffectiveLanguage(context: Context): String? =
        localeManager(context)?.applicationLocales?.get(0)?.toLanguageTag()
            ?: context.resources.configuration.locales[0]?.toLanguageTag()
            ?: Locale.getDefault().toLanguageTag()
}
