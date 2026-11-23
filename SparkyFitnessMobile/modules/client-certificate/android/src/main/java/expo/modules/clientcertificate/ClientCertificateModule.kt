package expo.modules.clientcertificate

import android.net.Uri
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val LOG_TAG = "ClientCertificate"

/**
 * JavaScript surface for the TLS client certificate. See
 * [ClientCertificateStore] for where it is kept and which connections use it.
 */
class ClientCertificateModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ClientCertificate")

    OnCreate {
      appContext.reactContext?.let { ClientCertificateStore.install(it, "JavaScript module") }
    }

    /** Hosts (no scheme or port) the certificate may be presented to. */
    Function("setAllowedHosts") { hosts: List<String> ->
      ClientCertificateStore.setAllowedHosts(hosts)
    }

    Function("getCertificateInfo") {
      ClientCertificateStore.info()?.toMap()
    }

    Function("removeCertificate") {
      ClientCertificateStore.remove()
    }

    /**
     * Which request paths the certificate is wired into. Always complete on
     * Android, where one socket factory covers them; iOS can report a gap.
     */
    Function("getHookStatus") {
      mapOf("fetch" to true, "images" to true, "reactNative" to true)
    }

    /**
     * Reads a PKCS#12 (.p12/.pfx) file and stores its key and certificate.
     * Resolves `{ ok: true, info }` or `{ ok: false, error }`; never rejects
     * for a bad file or password.
     */
    AsyncFunction("importCertificate") { fileUri: String, password: String ->
      val context = appContext.reactContext
        ?: return@AsyncFunction failure(ImportFailure.STORAGE)
      val characters = password.toCharArray()
      try {
        val stream = context.contentResolver.openInputStream(Uri.parse(fileUri))
        if (stream == null) {
          Log.w(LOG_TAG, "Could not open the picked file")
          return@AsyncFunction failure(ImportFailure.INVALID_FILE)
        }
        val info = stream.use { ClientCertificateStore.importPkcs12(it, characters) }
        mapOf("ok" to true, "info" to info.toMap())
      } catch (e: ImportException) {
        failure(e.failure)
      } catch (e: Exception) {
        // The exception message can carry the file path, so only its type is logged.
        Log.w(LOG_TAG, "Certificate import failed unexpectedly (${e.javaClass.simpleName})")
        failure(ImportFailure.INVALID_FILE)
      } finally {
        characters.fill('\u0000')
      }
    }
  }

  private fun failure(reason: ImportFailure): Map<String, Any?> =
    mapOf("ok" to false, "error" to reason.code)

  private fun CertificateInfo.toMap(): Map<String, Any?> =
    mapOf("subject" to subject, "expiresAt" to expiresAt.toDouble())
}
