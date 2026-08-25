package com.sparkyapps.sparkyfitness.language

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * Thin Android 13+ (API 33+) bridge over the platform per-app language API
 * (android.app.LocaleManager / applicationLocales).
 *
 * On Android 12 and below there is no per-app language API. The TS layer never
 * calls set/get there (the stored preference is authoritative and `system`
 * resolves through expo-localization); the SDK_INT guards below keep the
 * module defensive regardless. AppCompat locale APIs are intentionally NOT
 * used on any API level.
 *
 * Every API 33+ reference (android.app.LocaleManager, applicationLocales) is
 * isolated in `AppLanguageApi33`, which is loaded lazily only after the API 33
 * guard. This keeps the class verifier on Android <=12 from resolving
 * `android.app.LocaleManager` during module registration, preventing
 * `NoClassDefFoundError` / `VerifyError` at startup.
 */
class AppLanguageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun setApplicationLanguage(language: String?, promise: Promise) {
        if (Build.VERSION.SDK_INT < API_33) {
            // No platform per-app language API on Android <=12; treat the
            // request as a no-op.
            promise.resolve(null)
            return
        }

        val normalized = language?.trim()?.ifEmpty { null }
        val canonical = normalized?.let(::canonicalTag)
        if (canonical != null && canonical !in SUPPORTED_LANGUAGES_CANONICAL) {
            promise.reject("E_UNSUPPORTED_LANGUAGE", "Unsupported application language")
            return
        }

        try {
            AppLanguageApi33.setApplicationLanguage(reactApplicationContext, normalized)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("E_SET_LANGUAGE_FAILED", error)
        }
    }

    @ReactMethod
    fun getApplicationLanguage(promise: Promise) {
        if (Build.VERSION.SDK_INT < API_33) {
            // No platform per-app language API on Android <=12; report system.
            promise.resolve(null)
            return
        }
        try {
            val tags = AppLanguageApi33.getApplicationLanguage(reactApplicationContext)
            promise.resolve(tags?.substringBefore(',')?.ifEmpty { null })
        } catch (error: Exception) {
            promise.reject("E_GET_LANGUAGE_FAILED", error)
        }
    }

    @ReactMethod
    fun getEffectiveLanguage(promise: Promise) {
        try {
            // The API 33+ platform tag is preferred when available; the
            // configuration/Locale fallbacks are safe on every API level and
            // are kept here so the API 33 helper never has to handle them.
            val language = if (Build.VERSION.SDK_INT >= API_33) {
                AppLanguageApi33.getApplicationLanguageTag(reactApplicationContext)
                    ?: reactApplicationContext.resources.configuration.locales[0]?.toLanguageTag()
                    ?: Locale.getDefault().toLanguageTag()
            } else {
                reactApplicationContext.resources.configuration.locales[0]?.toLanguageTag()
                    ?: Locale.getDefault().toLanguageTag()
            }
            promise.resolve(language)
        } catch (error: Exception) {
            promise.reject("E_GET_EFFECTIVE_LANGUAGE_FAILED", error)
        }
    }

    companion object {
        private const val MODULE_NAME = "AppLanguage"
        private const val API_33 = 33
        // Generated from the TypeScript shipped-locale registry by Expo config.
        private val SUPPORTED_LANGUAGES = setOf("en", "pl")
        private val SUPPORTED_LANGUAGES_CANONICAL = SUPPORTED_LANGUAGES.map(::canonicalTag).toSet()

        private fun canonicalTag(value: String): String =
            Locale.forLanguageTag(value).toLanguageTag().lowercase(Locale.ROOT)
    }
}
