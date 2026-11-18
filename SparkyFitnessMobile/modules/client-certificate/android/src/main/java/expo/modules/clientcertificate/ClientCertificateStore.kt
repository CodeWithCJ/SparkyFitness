package expo.modules.clientcertificate

import android.content.Context
import android.content.SharedPreferences
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.modules.network.OkHttpClientProvider
import java.io.IOException
import java.io.InputStream
import java.lang.ref.WeakReference
import java.net.InetAddress
import java.net.Socket
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.UnrecoverableKeyException
import java.security.cert.X509Certificate
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509ExtendedKeyManager
import javax.net.ssl.X509TrustManager
import okhttp3.OkHttpClient

private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
// The certificate is stored under "<prefix>_<time>", and the preferences say
// which one is active. A new certificate is written under a new name and only
// becomes active once it is stored, so a failed replace keeps the old one.
// Builds before this kept it under the bare prefix, which still counts.
private const val KEY_ALIAS_PREFIX = "sparky_client_certificate"
private const val PREFS_ACTIVE_ALIAS = "active_alias"
private const val PREFS_NAME = "sparky_client_certificate"
private const val PREFS_ALLOWED_HOSTS = "allowed_hosts"
private const val LOG_TAG = "ClientCertificate"
private const val SECOND_EVICTION_DELAY_MS = 500L

/** Why an import was refused. The names are the values JavaScript receives. */
enum class ImportFailure(val code: String) {
  WRONG_PASSWORD("wrongPassword"),
  INVALID_FILE("invalidFile"),
  NO_PRIVATE_KEY("noPrivateKey"),
  STORAGE("storage"),
}

class ImportException(val failure: ImportFailure, cause: Throwable? = null) :
  Exception(failure.code, cause)

data class CertificateInfo(val subject: String, val expiresAt: Long)

/**
 * Holds the one TLS client certificate the app presents to the user's own
 * servers (a reverse proxy that requires mutual TLS).
 *
 * The private key lives in the Android Keystore, so it cannot be read back out
 * of the app. It is offered only during a handshake with a host on the allowed
 * list (the saved servers); every other connection, such as an image hosted by
 * a food provider, behaves as if no certificate existed.
 *
 * [install] wires this into every network path of the process:
 * - React Native's OkHttp provider, which `fetch` (expo/fetch) and expo-image
 *   take their clients from.
 * - The default `HttpsURLConnection` socket factory, which the water shortcut,
 *   tile and widget (LogWaterActivity) and the Wear OS relay
 *   (WatchConnectivityModule) use.
 *
 * A new native requester that builds its own client must take its socket
 * factory from here too.
 */
object ClientCertificateStore {
  private val lock = Any()
  private var installed = false
  private lateinit var prefs: SharedPreferences
  private lateinit var trustManager: X509TrustManager

  // Replaced whenever the certificate changes, so the new one starts with an
  // empty TLS session cache. A server that remembers a session resumes it
  // without asking for the certificate again, which would keep a removed
  // certificate working until the session expired.
  @Volatile
  private var sslContext: SSLContext? = null
  private val socketFactory = SwitchableSocketFactory {
    checkNotNull(sslContext) { "ClientCertificateStore is not installed" }.socketFactory
  }
  private val createdClients = mutableListOf<WeakReference<OkHttpClient>>()

  @Volatile
  private var allowedHosts: Set<String> = emptySet()

  private val keyStore: KeyStore by lazy {
    KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
  }

  /**
   * Safe to call more than once; only the first call does anything. [source]
   * names the caller for the log, which shows whether the process-start hook
   * ran before JavaScript did.
   */
  fun install(context: Context, source: String) {
    synchronized(lock) {
      if (installed) return
      Log.d(LOG_TAG, "Installing from $source")
      val appContext = context.applicationContext
      prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      allowedHosts = prefs.getStringSet(PREFS_ALLOWED_HOSTS, emptySet())?.toSet() ?: emptySet()

      // The platform default, which follows the app's network security config
      // (system and user certificate authorities).
      val trustManagerFactory =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
      trustManagerFactory.init(null as KeyStore?)
      trustManager =
        trustManagerFactory.trustManagers.filterIsInstance<X509TrustManager>().first()

      sslContext = newSslContext()

      // Both take the switchable factory, never a context's own, so replacing
      // the context reaches every client that already exists.
      HttpsURLConnection.setDefaultSSLSocketFactory(socketFactory)
      OkHttpClientProvider.setOkHttpClientFactory {
        val client = OkHttpClientProvider.createClientBuilder(appContext)
          .sslSocketFactory(socketFactory, trustManager)
          .build()
        synchronized(lock) {
          createdClients.removeAll { it.get() == null }
          createdClients.add(WeakReference(client))
        }
        client
      }
      installed = true
    }
  }

  fun setAllowedHosts(hosts: List<String>) {
    val normalized = hosts.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSet()
    if (normalized == allowedHosts) return
    // Counts only: the host names are the user's server names.
    Log.d(LOG_TAG, "Allowed hosts changed: ${allowedHosts.size} -> ${normalized.size}")
    allowedHosts = normalized
    synchronized(lock) {
      if (installed) prefs.edit().putStringSet(PREFS_ALLOWED_HOSTS, normalized).apply()
    }
  }

  /**
   * Stores the key and certificate chain from a PKCS#12 file, replacing any
   * earlier one. The password is used once and never kept.
   */
  @Throws(ImportException::class)
  fun importPkcs12(input: InputStream, password: CharArray): CertificateInfo {
    val source = try {
      KeyStore.getInstance("PKCS12").apply { load(input, password) }
    } catch (e: IOException) {
      // The reader reports a wrong password in two ways: an IOException caused
      // by an UnrecoverableKeyException, or one whose message says the MAC or
      // password is wrong. Anything else means the file is not a PKCS#12
      // store this Android version can read.
      val message = e.message?.lowercase().orEmpty()
      val wrongPassword = e.cause is UnrecoverableKeyException ||
        "wrong password" in message ||
        "mac invalid" in message ||
        "mac verify" in message
      Log.w(LOG_TAG, "PKCS12 load failed (wrong password: $wrongPassword)", e)
      throw ImportException(
        if (wrongPassword) ImportFailure.WRONG_PASSWORD else ImportFailure.INVALID_FILE,
        e,
      )
    } catch (e: Exception) {
      Log.w(LOG_TAG, "PKCS12 load failed", e)
      throw ImportException(ImportFailure.INVALID_FILE, e)
    }

    val alias = source.aliases().asSequence().firstOrNull { source.isKeyEntry(it) }
      ?: throw ImportException(ImportFailure.NO_PRIVATE_KEY)
    val key = try {
      source.getKey(alias, password)
    } catch (e: UnrecoverableKeyException) {
      Log.w(LOG_TAG, "PKCS12 key could not be recovered", e)
      throw ImportException(ImportFailure.WRONG_PASSWORD, e)
    } catch (e: Exception) {
      Log.w(LOG_TAG, "PKCS12 key could not be read", e)
      throw ImportException(ImportFailure.INVALID_FILE, e)
    }
    val chain = source.getCertificateChain(alias)
    if (key == null || chain.isNullOrEmpty()) {
      throw ImportException(ImportFailure.NO_PRIVATE_KEY)
    }

    synchronized(lock) {
      val newAlias = "${KEY_ALIAS_PREFIX}_${System.currentTimeMillis()}"
      val previousChoice = prefs.getString(PREFS_ACTIVE_ALIAS, null)
      try {
        keyStore.setKeyEntry(newAlias, key, null, chain)
        // commit(), not apply(): the old entries are deleted next, and the
        // choice of the new one must be on disk before that.
        if (!prefs.edit().putString(PREFS_ACTIVE_ALIAS, newAlias).commit()) {
          throw IOException("Could not save which certificate is active")
        }
      } catch (e: Exception) {
        Log.w(LOG_TAG, "Android Keystore refused the key; keeping the previous certificate", e)
        // A failed commit() still leaves the new value in memory, so put the
        // previous choice back before the half-written key goes. The previous
        // certificate itself was never touched.
        prefs.edit().apply {
          if (previousChoice != null) putString(PREFS_ACTIVE_ALIAS, previousChoice)
          else remove(PREFS_ACTIVE_ALIAS)
        }.apply()
        runCatching { if (keyStore.containsAlias(newAlias)) keyStore.deleteEntry(newAlias) }
        throw ImportException(ImportFailure.STORAGE, e)
      }
      // The new certificate is active now. Failing to delete an old one is not
      // a failed import: log it and carry on, and the next import tries again.
      try {
        deleteCertificateEntries(except = newAlias)
      } catch (e: Exception) {
        Log.w(LOG_TAG, "Could not delete a previous certificate; the new one is in use", e)
      }
    }
    dropOpenConnections()
    return info() ?: throw ImportException(ImportFailure.STORAGE)
  }

  fun remove() {
    try {
      synchronized(lock) {
        deleteCertificateEntries(except = null)
        prefs.edit().remove(PREFS_ACTIVE_ALIAS).apply()
      }
    } catch (e: Exception) {
      Log.w(LOG_TAG, "Android Keystore could not remove the key", e)
      throw e
    }
    dropOpenConnections()
  }

  /** Every alias this class has stored a certificate under (call with [lock] held). */
  private fun certificateAliases(): List<String> =
    keyStore.aliases().toList().filter { it.startsWith(KEY_ALIAS_PREFIX) }

  private fun deleteCertificateEntries(except: String?) {
    certificateAliases().filter { it != except }.forEach { keyStore.deleteEntry(it) }
  }

  /**
   * The alias of the certificate in use, or null when there is none (call with
   * [lock] held). If the saved choice points at nothing, the newest stored
   * certificate is used, so a stale preference can never leave a stored
   * certificate unusable. The bare prefix from earlier builds sorts first, and
   * the timestamps all have the same length, so the largest name is the newest.
   */
  private fun activeAlias(): String? {
    val saved = prefs.getString(PREFS_ACTIVE_ALIAS, null)
    if (saved != null && keyStore.containsAlias(saved)) return saved
    return certificateAliases().maxOrNull()
  }

  fun info(): CertificateInfo? {
    val certificate = synchronized(lock) {
      activeAlias()?.let { keyStore.getCertificate(it) } as? X509Certificate
    } ?: return null
    return CertificateInfo(
      subject = certificate.subjectX500Principal.name,
      expiresAt = certificate.notAfter.time,
    )
  }

  private fun newSslContext(): SSLContext =
    SSLContext.getInstance("TLS").apply {
      init(arrayOf(AllowedHostKeyManager()), arrayOf(trustManager), null)
    }

  /**
   * Makes a change take effect at once instead of whenever the old
   * connections and sessions happen to end: new requests get a fresh TLS
   * context (and so no resumable session), requests still running are
   * cancelled, and the connections are closed. Cancelling matters because a
   * busy HTTP/2 connection is never idle, so it would otherwise carry new
   * requests on the old certificate for as long as it stayed busy. A
   * cancelled call lets go of its connection only on its own thread, so the
   * connections are evicted again a moment later to catch any that were still
   * held the first time. The app retries whatever was cancelled, and a change
   * is something the user just did on purpose.
   *
   * Best effort: the certificate is already stored or removed by now, so
   * nothing here may turn a finished import or removal into an error.
   */
  private fun dropOpenConnections() {
    val clients = synchronized(lock) {
      if (!installed) return
      sslContext = newSslContext()
      createdClients.mapNotNull { it.get() }
    }
    clients.forEach { client ->
      try {
        client.dispatcher.cancelAll()
        client.connectionPool.evictAll()
      } catch (e: Exception) {
        Log.w(LOG_TAG, "Could not close connections", e)
      }
    }
    Handler(Looper.getMainLooper()).postDelayed({
      clients.forEach { client ->
        try {
          client.connectionPool.evictAll()
        } catch (e: Exception) {
          Log.w(LOG_TAG, "Could not close connections after the change", e)
        }
      }
    }, SECOND_EVICTION_DELAY_MS)
  }

  private fun aliasFor(peerHost: String?): String? {
    if (peerHost == null) {
      // Without the host there is no way to tell whose server is asking, so
      // nothing is offered. Logged because it would look like a broken import.
      Log.w(LOG_TAG, "A server asked for a client certificate but its host is unknown.")
      return null
    }
    val host = peerHost.lowercase()
    if (host !in allowedHosts) {
      Log.d(LOG_TAG, "A server asked for a client certificate: not offered (host not allowed)")
      return null
    }
    val alias = synchronized(lock) { activeAlias() }
    Log.d(LOG_TAG, "A server asked for a client certificate: ${if (alias != null) "offered" else "not offered (none stored)"}")
    return alias
  }

  /** Hands every call to the current context's factory, looked up each time. */
  private class SwitchableSocketFactory(private val current: () -> SSLSocketFactory) :
    SSLSocketFactory() {
    override fun getDefaultCipherSuites(): Array<String> = current().defaultCipherSuites

    override fun getSupportedCipherSuites(): Array<String> = current().supportedCipherSuites

    override fun createSocket(): Socket = current().createSocket()

    override fun createSocket(socket: Socket, host: String, port: Int, autoClose: Boolean): Socket =
      current().createSocket(socket, host, port, autoClose)

    override fun createSocket(host: String, port: Int): Socket =
      current().createSocket(host, port)

    override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket =
      current().createSocket(host, port, localHost, localPort)

    override fun createSocket(host: InetAddress, port: Int): Socket =
      current().createSocket(host, port)

    override fun createSocket(
      address: InetAddress,
      port: Int,
      localAddress: InetAddress,
      localPort: Int,
    ): Socket = current().createSocket(address, port, localAddress, localPort)
  }

  /**
   * Answers a server's certificate request with the stored key when, and only
   * when, the server is an allowed host. Read at handshake time, so importing
   * or removing a certificate needs no new client.
   */
  private class AllowedHostKeyManager : X509ExtendedKeyManager() {
    override fun chooseClientAlias(
      keyTypes: Array<String>?,
      issuers: Array<Principal>?,
      socket: Socket?,
    ): String? = aliasFor((socket as? SSLSocket)?.handshakeSession?.peerHost)

    override fun chooseEngineClientAlias(
      keyTypes: Array<String>?,
      issuers: Array<Principal>?,
      engine: SSLEngine?,
    ): String? = aliasFor(engine?.peerHost)

    override fun getClientAliases(keyType: String?, issuers: Array<Principal>?): Array<String>? =
      null

    override fun getCertificateChain(alias: String?): Array<X509Certificate>? {
      if (alias == null || !alias.startsWith(KEY_ALIAS_PREFIX)) return null
      return synchronized(lock) {
        keyStore.getCertificateChain(alias)
          ?.filterIsInstance<X509Certificate>()
          ?.toTypedArray()
      }
    }

    override fun getPrivateKey(alias: String?): PrivateKey? {
      if (alias == null || !alias.startsWith(KEY_ALIAS_PREFIX)) return null
      return synchronized(lock) { keyStore.getKey(alias, null) as? PrivateKey }
    }

    override fun getServerAliases(keyType: String?, issuers: Array<Principal>?): Array<String>? =
      null

    override fun chooseServerAlias(
      keyType: String?,
      issuers: Array<Principal>?,
      socket: Socket?,
    ): String? = null
  }
}
