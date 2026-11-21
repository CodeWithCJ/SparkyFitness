package expo.modules.watchconnectivity

import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService

/**
 * Minimal, privacy-scoped NotificationListenerService used solely as the
 * Android-required [ComponentName] token for [android.media.session.MediaSessionManager]
 * so the Wear OS Now Playing page can read active media metadata (track title,
 * artist, playback state) and route transport controls to the active session.
 *
 * This service deliberately does not override notification content callbacks
 * and disables non-ongoing notification filter categories in the manifest.
 */
class SparkyMediaListenerService : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    PhoneMediaBridge.onListenerConnectionChanged(applicationContext, connected = true)
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    PhoneMediaBridge.onListenerConnectionChanged(applicationContext, connected = false)
  }

  companion object {
    fun componentName(context: Context): ComponentName =
      ComponentName(context.applicationContext, SparkyMediaListenerService::class.java)
  }
}
