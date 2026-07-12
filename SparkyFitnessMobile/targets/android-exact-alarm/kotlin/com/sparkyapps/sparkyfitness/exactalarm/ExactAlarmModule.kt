package com.sparkyapps.sparkyfitness.exactalarm

import android.app.AlarmManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Exact-alarm ("Alarms & reminders") special-access helpers. expo-notifications
 * silently falls back to inexact, OS-batched (~15s late) alarms when the access
 * is not granted, and exposes no JS way to detect or request it — so the
 * rest-complete ping's grant flow owns these two methods.
 */
class ExactAlarmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /** Whether scheduled notifications will fire exactly. */
    @ReactMethod
    fun canScheduleExactAlarms(promise: Promise) {
        try {
            val allowed = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                true
            } else {
                val alarmManager =
                    reactApplicationContext.getSystemService(Context.ALARM_SERVICE) as AlarmManager
                alarmManager.canScheduleExactAlarms()
            }
            promise.resolve(allowed)
        } catch (e: Exception) {
            promise.reject("E_ALARM_CHECK_FAILED", e)
        }
    }

    /** Open the system "Alarms & reminders" grant screen for this app. */
    @ReactMethod
    fun openExactAlarmSettings(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val ctx = reactApplicationContext
                val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
                    data = Uri.parse("package:" + ctx.packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                try {
                    ctx.startActivity(intent)
                } catch (e: ActivityNotFoundException) {
                    // Some OEMs reject the per-app data URI; the app-list form
                    // of the same screen still lets the user find the toggle.
                    intent.data = null
                    ctx.startActivity(intent)
                }
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_ALARM_SETTINGS_FAILED", e)
        }
    }

    companion object {
        const val NAME = "ExactAlarm"
    }
}
