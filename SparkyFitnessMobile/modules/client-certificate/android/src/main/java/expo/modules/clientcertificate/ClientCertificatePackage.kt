package expo.modules.clientcertificate

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

/**
 * Installs the client certificate into the network stack when the app process
 * starts, before React Native exists. The water shortcut worker and the Wear OS
 * relay run in a process started without the app's screens, and they need it
 * as much as the app does.
 */
class ClientCertificatePackage : Package {
  override fun createApplicationLifecycleListeners(
    context: Context
  ): List<ApplicationLifecycleListener> = listOf(
    object : ApplicationLifecycleListener {
      override fun onCreate(application: Application) {
        ClientCertificateStore.install(application, "application start")
      }
    }
  )
}
