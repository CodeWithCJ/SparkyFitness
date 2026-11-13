package com.sparkyapps.sparkyfitness.backgroundwater

import android.content.Context
import android.content.Intent
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Lets JavaScript keep the copy of the login used by the "Log water"
 * shortcut. The launcher shortcut exists only while that copy does.
 */
class BackgroundWaterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /** Stores the JSON config, or erases it (and the shortcut) when null. */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun setConfig(json: String?): Boolean {
        val context = reactApplicationContext
        val saved = BackgroundWaterStore.save(context, json)
        if (json == null || !saved) {
            try {
                ShortcutManagerCompat.removeDynamicShortcuts(context, listOf(SHORTCUT_ID))
            } catch (e: Exception) {
                // The shortcut is a convenience; the stored copy is what matters.
            }
        } else {
            publishShortcut(context)
        }
        return saved
    }

    /**
     * Labels the shortcut in the app language and puts it back while a login
     * is stored. The other app shortcuts (expo-quick-actions) are registered by
     * replacing the whole dynamic list, which drops this one, so JavaScript
     * calls this after them. False while no login is stored, or when Android
     * did not publish it (it rate-limits shortcut updates).
     */
    @ReactMethod(isBlockingSynchronousMethod = true)
    fun refreshShortcut(shortLabel: String, longLabel: String): Boolean {
        val context = reactApplicationContext
        context.getSharedPreferences(LABEL_PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_SHORT_LABEL, shortLabel)
            .putString(KEY_LONG_LABEL, longLabel)
            .apply()
        if (BackgroundWaterStore.load(context) == null) return false
        return publishShortcut(context)
    }

    private fun publishShortcut(context: Context): Boolean {
        return try {
            val labels = context.getSharedPreferences(LABEL_PREFS, Context.MODE_PRIVATE)
            val intent = Intent(context, LogWaterActivity::class.java).apply {
                action = Intent.ACTION_VIEW
            }
            val shortcut = ShortcutInfoCompat.Builder(context, SHORTCUT_ID)
                .setShortLabel(labels.getString(KEY_SHORT_LABEL, null) ?: "Log water")
                .setLongLabel(
                    labels.getString(KEY_LONG_LABEL, null)
                        ?: "Log water without opening the app"
                )
                .setIcon(shortcutIcon(context))
                .setIntent(intent)
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
        } catch (e: Exception) {
            // The shortcut is a convenience; the stored copy is what matters.
            false
        }
    }

    // Copied into the app's resources by plugins/withBackgroundWater.ts. Looked
    // up by name because the app's R class lives in a package that differs
    // between the dev and production builds.
    private fun shortcutIcon(context: Context): IconCompat {
        val icon = context.resources.getIdentifier(ICON_NAME, "drawable", context.packageName)
        return IconCompat.createWithResource(
            context,
            if (icon != 0) icon else context.applicationInfo.icon
        )
    }

    companion object {
        const val NAME = "BackgroundWater"
        const val SHORTCUT_ID = "log-water-background"
        private const val ICON_NAME = "ic_shortcut_log_water"
        // Not the encrypted store: the labels are not secret, and they have
        // to outlive a sign-out so the next sign-in is labelled right away.
        private const val LABEL_PREFS = "sparky_background_water_shortcut"
        private const val KEY_SHORT_LABEL = "short_label"
        private const val KEY_LONG_LABEL = "long_label"
    }
}
