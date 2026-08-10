package com.sparkyapps.sparkyfitness.language

import android.app.LocaleManager
import android.content.Context
import android.os.Build
import android.os.LocaleList
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
 */
class AppLanguageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    private fun localeManager(): LocaleManager? {
        if (Build.VERSION.SDK_INT < API_33) return null
        return reactApplicationContext.getSystemService(Context.LOCALE_SERVICE) as? LocaleManager
    }

    @ReactMethod
    fun setApplicationLanguage(language: String?, promise: Promise) {
        if (Build.VERSION.SDK_INT < API_33) {
            // No platform per-app language API on Android <=12; treat the
            // request as a no-op.
            promise.resolve(null)
            return
        }

        val normalized = language?.trim()?.lowercase(Locale.ROOT)?.ifEmpty { null }
        if (normalized != null && normalized !in SUPPORTED_LANGUAGES) {
            promise.reject("E_UNSUPPORTED_LANGUAGE", "Only en, pl, or null are supported")
            return
        }

        try {
            val locales = if (normalized == null) {
                LocaleList.getEmptyLocaleList()
            } else {
                LocaleList.forLanguageTags(normalized)
            }
            localeManager()?.applicationLocales = locales
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
            val tags = localeManager()?.applicationLocales?.toLanguageTags()
            promise.resolve(tags?.substringBefore(',')?.ifEmpty { null })
        } catch (error: Exception) {
            promise.reject("E_GET_LANGUAGE_FAILED", error)
        }
    }

    @ReactMethod
    fun getEffectiveLanguage(promise: Promise) {
        try {
            val language = if (Build.VERSION.SDK_INT >= API_33) {
                localeManager()?.applicationLocales?.get(0)?.language
                    ?: reactApplicationContext.resources.configuration.locales[0]?.language
                    ?: Locale.getDefault().language
            } else {
                reactApplicationContext.resources.configuration.locales[0]?.language
                    ?: Locale.getDefault().language
            }
            promise.resolve(language)
        } catch (error: Exception) {
            promise.reject("E_GET_EFFECTIVE_LANGUAGE_FAILED", error)
        }
    }

    companion object {
        private const val MODULE_NAME = "AppLanguage"
        private const val API_33 = 33
        private val SUPPORTED_LANGUAGES = setOf("en", "pl")
    }
}
