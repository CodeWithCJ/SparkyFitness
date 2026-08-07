package com.sparkyapps.sparkyfitness.language

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.util.Locale

class AppLanguageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = MODULE_NAME

    @ReactMethod
    fun setApplicationLanguage(language: String?, promise: Promise) {
        val normalized = language?.trim()?.lowercase(Locale.ROOT)?.ifEmpty { null }
        if (normalized != null && normalized !in SUPPORTED_LANGUAGES) {
            promise.reject("E_UNSUPPORTED_LANGUAGE", "Only en, pl, or null are supported")
            return
        }

        UiThreadUtil.runOnUiThread {
            try {
                val locales = if (normalized == null) {
                    LocaleListCompat.getEmptyLocaleList()
                } else {
                    LocaleListCompat.forLanguageTags(normalized)
                }
                AppCompatDelegate.setApplicationLocales(locales)
                promise.resolve(null)
            } catch (error: Exception) {
                promise.reject("E_SET_LANGUAGE_FAILED", error)
            }
        }
    }

    @ReactMethod
    fun getApplicationLanguage(promise: Promise) {
        try {
            val tags = AppCompatDelegate.getApplicationLocales().toLanguageTags()
            promise.resolve(tags.substringBefore(',').ifEmpty { null })
        } catch (error: Exception) {
            promise.reject("E_GET_LANGUAGE_FAILED", error)
        }
    }

    @ReactMethod
    fun getEffectiveLanguage(promise: Promise) {
        try {
            val language = reactApplicationContext.resources.configuration.locales[0]?.language
                ?: Locale.getDefault().language
            promise.resolve(language)
        } catch (error: Exception) {
            promise.reject("E_GET_EFFECTIVE_LANGUAGE_FAILED", error)
        }
    }

    companion object {
        private const val MODULE_NAME = "AppLanguage"
        private val SUPPORTED_LANGUAGES = setOf("en", "pl")
    }
}
