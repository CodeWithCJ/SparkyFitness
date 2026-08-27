import ExpoModulesCore
import WatchConnectivity

/// `WCSessionDelegate` extends `NSObjectProtocol`, which Swift only allows an
/// actual `NSObject` subclass to conform to — Expo's `Module` base class does
/// not qualify. So the delegate lives here and forwards to the module through
/// closures.
private class WatchSessionDelegateHandler: NSObject, WCSessionDelegate {
    var onReachabilityChange: ((Bool) -> Void)?
    /// A check-in captured on the watch, awaiting a server write.
    var onCheckIn: (([String: Any]) -> Void)?
    /// The watch asking for fresh seed values + history.
    var onContextRequest: (() -> Void)?

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func route(_ payload: [String: Any]) {
        switch payload["type"] as? String {
        case "checkIn":
            onCheckIn?(payload)
        case "requestContext":
            onContextRequest?()
        default:
            break
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        onReachabilityChange?(session.isReachable)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so switching between paired Watches keeps working.
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        onReachabilityChange?(session.isReachable)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        route(message)
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        route(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        route(userInfo)
    }
}

/// Phone-side bridge exposed to JS as `WatchConnectivity`.
///
/// The watch cannot reach the SparkyFitness server itself — authentication lives
/// here — so this module is the transport: it surfaces check-ins captured on the
/// watch to JS, which writes them via the normal measurements API, then relays
/// acknowledgements and fresh seed data back.
public class WatchConnectivityModule: Module {
    private let delegateHandler = WatchSessionDelegateHandler()

    public func definition() -> ModuleDefinition {
        Name("WatchConnectivity")

        Events("onReachabilityChange", "onCheckIn", "onContextRequest")

        OnCreate {
            self.delegateHandler.onReachabilityChange = { [weak self] isReachable in
                self?.sendEvent("onReachabilityChange", ["isReachable": isReachable])
            }
            self.delegateHandler.onCheckIn = { [weak self] payload in
                self?.sendEvent("onCheckIn", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "weightKg": payload["weightKg"] as? Double ?? 0,
                    // Absent (rather than null) when the wearer skipped body fat,
                    // so the JS side can omit it from the upsert instead of
                    // erasing an existing value.
                    "bodyFatPercentage": payload["bodyFatPercentage"] as? Double,
                ])
            }
            self.delegateHandler.onContextRequest = { [weak self] in
                self?.sendEvent("onContextRequest", [:])
            }
            self.delegateHandler.activate()
        }

        Function("isSupported") { () -> Bool in
            WCSession.isSupported()
        }

        Function("isReachable") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isReachable
        }

        Function("isPaired") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isPaired
        }

        /// Pushes seed values, recent history and acknowledged client ids to the
        /// watch. Application context is latest-value-only and survives the watch
        /// app being asleep, which is exactly the semantics wanted here — a
        /// missed update is simply superseded by the next one.
        AsyncFunction("updateContext") { (context: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = context
            payload["type"] = "context"
            try WCSession.default.updateApplicationContext(payload)
        }

        /// Immediate per-check-in acknowledgement for when the watch app is in
        /// the foreground. The authoritative ack still rides in the context, so
        /// this failing is harmless.
        AsyncFunction("sendAck") { (clientId: String, ok: Bool) -> Void in
            guard WCSession.isSupported(), WCSession.default.isReachable else { return }
            WCSession.default.sendMessage(
                ["type": "ack", "clientId": clientId, "ok": ok],
                replyHandler: nil,
                errorHandler: nil
            )
        }
    }
}
