import Foundation
import Security

// The one TLS client certificate the app presents to the user's own servers (a
// reverse proxy that requires mutual TLS), and the rule for when to present it.
//
// Uses Foundation and Security only, because this same file is compiled into
// three places:
// - the ClientCertificateModule pod (the app's fetch and image requests, and
//   modules/background-water, which depends on that pod),
// - the app target (copied there by plugins/withBackgroundWater.ts, for the
//   Siri and Shortcuts intents in ShortcutIntents.swift),
// - the widget extension (copied into targets/widget by its
//   expo-target.config.js, for the Lock Screen and Control Center controls).
//
// The identity lives in the Keychain group the app shares with the widget
// extension, and the allowed hosts in the shared App Group defaults, so all
// three read the same answer. Any native code that makes its own request to
// the user's server must answer its authentication challenge with
// `ClientCertificateIdentity.credential(for:)`.

public enum ClientCertificateIdentity {
    static let keychainLabel = "com.sparkyapps.sparkyfitness.clientCertificate"
    static let allowedHostsKey = "sparky.clientCertificate.allowedHosts"

    /// The Keychain group shared with the widget extension, filled in at build
    /// time. Nil in a build without it, where only the app can read the identity.
    static func sharedKeychainGroup() -> String? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "SparkyKeychainGroup") as? String,
              !group.isEmpty, !group.contains("$(") else { return nil }
        return group
    }

    static func sharedDefaults() -> UserDefaults {
        if let group = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
           !group.isEmpty, let defaults = UserDefaults(suiteName: group) {
            return defaults
        }
        return .standard
    }

    // MARK: - Allowed hosts

    /// Hosts (lowercase, no scheme or port) the certificate may be presented to.
    public static func allowedHosts() -> Set<String> {
        Set(sharedDefaults().stringArray(forKey: allowedHostsKey) ?? [])
    }

    public static func setAllowedHosts(_ hosts: [String]) {
        let normalized = Set(
            hosts.map { $0.trimmingCharacters(in: .whitespaces).lowercased() }.filter { !$0.isEmpty }
        )
        sharedDefaults().set(normalized.sorted(), forKey: allowedHostsKey)
    }

    // MARK: - Keychain

    private static func baseQuery(accessGroup: String?) -> [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassIdentity,
            kSecAttrLabel as String: keychainLabel,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        return query
    }

    private static func copyIdentity(accessGroup: String?) -> SecIdentity? {
        var query = baseQuery(accessGroup: accessGroup)
        query[kSecReturnRef as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let item, CFGetTypeID(item) == SecIdentityGetTypeID() else { return nil }
        return (item as! SecIdentity)
    }

    public static func identity() -> SecIdentity? {
        if let group = sharedKeychainGroup(), let shared = copyIdentity(accessGroup: group) {
            return shared
        }
        // A build without the shared group keeps it in the app's own group.
        return copyIdentity(accessGroup: nil)
    }

    /// Replaces any stored identity. Returns false when the Keychain refused it.
    @discardableResult
    public static func store(_ identity: SecIdentity) -> Bool {
        remove()
        func add(accessGroup: String?) -> Bool {
            var query = baseQuery(accessGroup: accessGroup)
            query[kSecValueRef as String] = identity
            // Readable after the first unlock so background sync and a Shortcut
            // run from the Lock Screen still work; never copied to other devices.
            query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
        }
        if let group = sharedKeychainGroup(), add(accessGroup: group) { return true }
        // The shared group needs the Keychain Sharing entitlement in the
        // provisioning profile. Without it the app-only copy still covers the
        // app itself; the widget controls then cannot use the certificate.
        return add(accessGroup: nil)
    }

    public static func remove() {
        if let group = sharedKeychainGroup() {
            SecItemDelete(baseQuery(accessGroup: group) as CFDictionary)
        }
        SecItemDelete(baseQuery(accessGroup: nil) as CFDictionary)
    }

    // MARK: - Challenge

    /// The credential for a server's client certificate request, or nil when
    /// this is another kind of challenge, the host is not one of the user's
    /// servers, or no certificate is stored. Nil means "handle as usual".
    public static func credential(for challenge: URLAuthenticationChallenge) -> URLCredential? {
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodClientCertificate,
              allowedHosts().contains(space.host.lowercased()),
              let identity = identity() else { return nil }
        return URLCredential(identity: identity, certificates: nil, persistence: .none)
    }
}
