import ExpoModulesCore
import Foundation
import Security

// JavaScript surface for the TLS client certificate. See
// ClientCertificateIdentity.swift for where it is kept and
// ClientCertificateHooks.swift for which requests present it.

/// Wraps the request delegates at launch, before any session exists.
public final class ClientCertificateSubscriber: ExpoAppDelegateSubscriber {
    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        ClientCertificateHooks.install()
        return true
    }
}

public class ClientCertificateModule: Module {
    public func definition() -> ModuleDefinition {
        Name("ClientCertificate")

        OnCreate {
            ClientCertificateHooks.install()
        }

        /// Hosts (no scheme or port) the certificate may be presented to.
        Function("setAllowedHosts") { (hosts: [String]) in
            ClientCertificateIdentity.setAllowedHosts(hosts)
        }

        Function("getCertificateInfo") { () -> [String: Any?]? in
            ClientCertificateIdentity.identity().flatMap(certificateInfo)
        }

        Function("removeCertificate") {
            ClientCertificateIdentity.remove()
        }

        /// Which request paths the certificate is wired into (see
        /// ClientCertificateHooks). A false value means it will not be sent there.
        Function("getHookStatus") { () -> [String: Bool] in
            ClientCertificateHooks.status
        }

        /// Reads a PKCS#12 (.p12/.pfx) file and stores its identity. Resolves
        /// `{ ok: true, info }` or `{ ok: false, error }`; never rejects for a
        /// bad file or password. The password is used once and never kept.
        AsyncFunction("importCertificate") { (fileUri: String, password: String) -> [String: Any?] in
            guard let url = URL(string: fileUri), let data = try? Data(contentsOf: url) else {
                return failure("invalidFile")
            }
            var items: CFArray?
            let options = [kSecImportExportPassphrase as String: password] as CFDictionary
            let status = SecPKCS12Import(data as CFData, options, &items)
            if status == errSecAuthFailed { return failure("wrongPassword") }
            guard status == errSecSuccess, let entries = items as? [[String: Any]] else {
                return failure("invalidFile")
            }
            guard let entry = entries.first(where: { $0[kSecImportItemIdentity as String] != nil }),
                  let value = entry[kSecImportItemIdentity as String] else {
                return failure("noPrivateKey")
            }
            // Present whenever the key exists, and always a SecIdentity.
            let identity = value as! SecIdentity
            guard ClientCertificateIdentity.store(identity), let info = certificateInfo(identity) else {
                return failure("storage")
            }
            return ["ok": true, "info": info]
        }
    }
}

private func failure(_ error: String) -> [String: Any?] {
    ["ok": false, "error": error]
}

private func certificateInfo(_ identity: SecIdentity) -> [String: Any?]? {
    var certificate: SecCertificate?
    guard SecIdentityCopyCertificate(identity, &certificate) == errSecSuccess,
          let certificate else { return nil }
    let subject = SecCertificateCopySubjectSummary(certificate) as String? ?? ""
    var expiresAt: Double?
    // iOS has no public way to read the expiry date before iOS 18.
    if #available(iOS 18.0, *), let date = SecCertificateCopyNotValidAfterDate(certificate) {
        expiresAt = (date as Date).timeIntervalSince1970 * 1000
    }
    return ["subject": subject, "expiresAt": expiresAt]
}
