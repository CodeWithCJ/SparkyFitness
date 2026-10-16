package expo.modules.stepcounter

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val READ_TIMEOUT_MS = 4000L

/**
 * One reading of [Sensor.TYPE_STEP_COUNTER], which is steps since boot.
 *
 * `expo-sensors` hides that total: its listener reports steps since the
 * listener itself started, and a date-range query throws. Sampling the raw
 * counter at the start of a session and again at the end works after the app
 * has been killed, which a listener held open for the whole session does not.
 */
class StepCounterModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StepCounter")

    AsyncFunction("readSinceBoot") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null || !hasRecognitionPermission(context)) {
        promise.resolve(null)
        return@AsyncFunction
      }
      val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
      val sensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
      if (sensorManager == null || sensor == null) {
        promise.resolve(null)
        return@AsyncFunction
      }

      val handler = Handler(Looper.getMainLooper())
      var settled = false
      lateinit var listener: SensorEventListener
      fun finish(value: Double?) {
        if (settled) return
        settled = true
        sensorManager.unregisterListener(listener)
        promise.resolve(value)
      }
      listener =
        object : SensorEventListener {
          override fun onSensorChanged(event: SensorEvent) {
            val count = event.values.firstOrNull()
            if (count == null || !count.isFinite() || count < 0) finish(null)
            else finish(count.toDouble())
          }

          override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
      val registered =
        sensorManager.registerListener(
          listener,
          sensor,
          SensorManager.SENSOR_DELAY_UI,
          handler
        )
      if (!registered) {
        promise.resolve(null)
        return@AsyncFunction
      }
      handler.postDelayed({ finish(null) }, READ_TIMEOUT_MS)
    }
  }

  private fun hasRecognitionPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACTIVITY_RECOGNITION
    ) == PackageManager.PERMISSION_GRANTED
  }
}
