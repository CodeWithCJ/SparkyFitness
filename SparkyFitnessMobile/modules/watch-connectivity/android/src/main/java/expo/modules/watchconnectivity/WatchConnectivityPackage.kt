package expo.modules.watchconnectivity

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package
import expo.modules.watchconnectivity.garmin.GarminLink

/**
 * Starts the Garmin link when the app process starts, before React Native
 * exists, if JS turned it on in an earlier run (`startGarmin`, until
 * `stopGarmin`). With binder delivery Garmin Connect starts the process
 * itself to hand over a watch message, and the Connect IQ SDK drops that
 * message unless it was initialised, with its listener set, by then.
 */
class WatchConnectivityPackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context
  ): List<ApplicationLifecycleListener> = listOf(
    object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        GarminLink.startAtProcessStart(application)
      }
    }
  )
}
