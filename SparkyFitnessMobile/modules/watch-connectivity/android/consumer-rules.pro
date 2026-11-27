# Garmin Connect sends IQDevice and IQApp back inside broadcast intents, which
# Android unparcels by class name, and talks to the SDK through AIDL stubs, so
# the Connect IQ SDK classes must keep their names.
-keep class com.garmin.android.connectiq.** { *; }
-keep class com.garmin.android.apps.connectmobile.connectiq.** { *; }
-keep class com.garmin.monkeybrains.serialization.** { *; }
