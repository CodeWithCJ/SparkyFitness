import Foundation
import ObjectiveC

// Gives request code the app does not own a chance to present the client
// certificate.
//
// A server's certificate request reaches a URLSession delegate as an
// authentication challenge, and iOS sends no certificate unless the delegate
// answers it: a credential registered in URLCredentialStorage is ignored. The
// libraries the app's requests go through (Expo's fetch, the image downloader,
// React Native's networking) each own a delegate that knows nothing about
// client certificates, and Expo ships them precompiled, so their source cannot
// be patched. Instead the delegate's challenge method is wrapped at launch:
// the wrapper answers when `ClientCertificateIdentity` has a credential for
// the host, and otherwise calls the original, so nothing changes for any other
// challenge or host.
//
// `status` reports which classes were found, so a library that renames its
// delegate shows up in the app instead of failing silently.

public enum ClientCertificateHooks {
    /// Session delegates of the request paths that reach the user's server.
    /// Names are the Objective-C runtime names (`Module.Class` for Swift).
    static let targets: [(key: String, className: String)] = [
        // expo/fetch, which is the app's global `fetch`.
        ("fetch", "ExpoModulesCore.URLSessionSessionDelegateProxy"),
        // expo-image (SDWebImage).
        ("images", "SDWebImageDownloader"),
        // React Native's own networking (XMLHttpRequest, <Image>).
        ("reactNative", "RCTHTTPRequestHandler"),
    ]

    private static let challengeSelector = NSSelectorFromString(
        "URLSession:task:didReceiveChallenge:completionHandler:")
    private static let sessionChallengeSelector = NSSelectorFromString(
        "URLSession:didReceiveChallenge:completionHandler:")

    private typealias Completion =
        @convention(block) (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    private typealias OriginalFunction =
        @convention(c) (
            AnyObject, Selector, URLSession, URLSessionTask, URLAuthenticationChallenge, Completion
        ) -> Void
    private typealias OriginalSessionFunction =
        @convention(c) (
            AnyObject, Selector, URLSession, URLAuthenticationChallenge, Completion
        ) -> Void

    private static let lock = NSLock()
    nonisolated(unsafe) private static var hooked: [String: Bool] = [:]

    /// Which request paths the certificate is wired into. A false entry means
    /// that library's delegate class was not found in this build.
    public static var status: [String: Bool] {
        lock.lock()
        defer { lock.unlock() }
        return hooked
    }

    /// Wraps each target once. Call as early as possible: a session reads what
    /// its delegate implements when the session is created.
    public static func install() {
        lock.lock()
        defer { lock.unlock() }
        guard hooked.isEmpty else { return }
        for target in targets {
            hooked[target.key] = wrapChallengeMethod(ofClassNamed: target.className) {
                ClientCertificateIdentity.credential(for: $0)
            }
        }
    }

    /// Returns false when the class does not exist.
    static func wrapChallengeMethod(
        ofClassNamed className: String,
        credential: @escaping (URLAuthenticationChallenge) -> URLCredential?
    ) -> Bool {
        guard let target: AnyClass = NSClassFromString(className) else { return false }
        let selector = challengeSelector
        let method = class_getInstanceMethod(target, selector)
        let originalImplementation = method.map { method_getImplementation($0) }

        let wrapper:
            @convention(block) (
                AnyObject, URLSession, URLSessionTask, URLAuthenticationChallenge,
                @escaping Completion
            ) -> Void = { object, session, task, challenge, completion in
                if let credential = credential(challenge) {
                    completion(.useCredential, credential)
                } else if let originalImplementation {
                    let original = unsafeBitCast(originalImplementation, to: OriginalFunction.self)
                    original(object, selector, session, task, challenge, completion)
                } else {
                    completion(.performDefaultHandling, nil)
                }
            }
        let implementation = imp_implementationWithBlock(wrapper)
        if let method {
            class_replaceMethod(target, selector, implementation, method_getTypeEncoding(method))
        } else {
            class_addMethod(target, selector, implementation, "v@:@@@@?")
        }
        wrapSessionChallengeMethod(of: target, credential: credential)
        return true
    }

    /// A delegate that also implements the session-level challenge method is
    /// sent certificate requests there and never on the task-level one, so
    /// that method is wrapped too. It is never added: without it, URLSession
    /// falls back to the task-level method wrapped above.
    private static func wrapSessionChallengeMethod(
        of target: AnyClass,
        credential: @escaping (URLAuthenticationChallenge) -> URLCredential?
    ) {
        let selector = sessionChallengeSelector
        guard let method = class_getInstanceMethod(target, selector) else { return }
        let originalImplementation = method_getImplementation(method)
        let wrapper:
            @convention(block) (
                AnyObject, URLSession, URLAuthenticationChallenge, @escaping Completion
            ) -> Void = { object, session, challenge, completion in
                if let credential = credential(challenge) {
                    completion(.useCredential, credential)
                } else {
                    let original = unsafeBitCast(
                        originalImplementation, to: OriginalSessionFunction.self)
                    original(object, selector, session, challenge, completion)
                }
            }
        class_replaceMethod(
            target, selector, imp_implementationWithBlock(wrapper), method_getTypeEncoding(method))
    }
}
