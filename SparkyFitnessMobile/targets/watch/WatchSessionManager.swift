import Foundation
import WatchConnectivity
import Combine

/// Watch-side WatchConnectivity wrapper.
///
/// Sends captured check-ins to the phone (which owns authentication and the
/// server API) and receives seed values, recent history and acks back.
///
/// Deliberately prefers `transferUserInfo` over `sendMessage` for check-ins:
/// the phone is realistically in another room, `sendMessage` fails outright when
/// unreachable, and a queued transfer is delivered by the system later. Losing a
/// morning's weight because the phone was charging in the bedroom would defeat
/// the whole point of the app.
@MainActor
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    @Published private(set) var isReachable: Bool = false

    private let store = CheckInStore.shared

    private override init() {
        super.init()
        activate()
    }

    private func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Hands a check-in to the system for delivery. Returns the state to show:
    /// `.queued` always, because even a reachable phone hasn't written to the
    /// server yet — the ack flips it to `.saved`.
    func send(_ checkIn: CheckIn) -> SyncState {
        guard WCSession.isSupported() else { return .failed }
        WCSession.default.transferUserInfo(checkIn.payload)
        return .queued
    }

    /// Re-queues everything still unconfirmed. Used by the retry affordance and
    /// on app launch, since a transfer can be lost if the app was force-quit.
    func retryPending() {
        guard WCSession.isSupported() else { return }
        for checkIn in store.retryable {
            WCSession.default.transferUserInfo(checkIn.payload)
        }
    }

    /// Asks the phone for a fresh context (seed values + history). Only works
    /// while the phone app is running, so the cached context is always the
    /// fallback.
    func requestContext() {
        guard WCSession.isSupported(), WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["type": "requestContext"], replyHandler: nil, errorHandler: nil)
    }

    private func handle(context payload: [String: Any]) {
        let history = (payload["history"] as? [[String: Any]] ?? []).compactMap { entry -> HistoryPoint? in
            guard let day = entry["day"] as? String,
                  let weight = entry["weightKg"] as? Double else { return nil }
            return HistoryPoint(
                day: day,
                weightKg: weight,
                bodyFatPercentage: entry["bodyFatPercentage"] as? Double
            )
        }

        let incoming = WatchContext(
            today: payload["today"] as? String,
            todayWeightKg: payload["todayWeightKg"] as? Double,
            todayBodyFatPercentage: payload["todayBodyFatPercentage"] as? Double,
            lastWeightKg: payload["lastWeightKg"] as? Double,
            lastBodyFatPercentage: payload["lastBodyFatPercentage"] as? Double,
            lastEntryDate: payload["lastEntryDate"] as? String,
            history: history,
            ackedClientIds: payload["ackedClientIds"] as? [String] ?? [],
            updatedAt: Date(),
            // nil (→ .kg via effectiveWeightUnit) when absent or unrecognized,
            // e.g. a phone build from before this field existed.
            weightUnit: (payload["weightUnit"] as? String).flatMap(WeightUnit.init(rawValue:))
        )
        store.apply(context: incoming)
    }

    private func handle(ack payload: [String: Any]) {
        guard let clientId = payload["clientId"] as? String else { return }
        let ok = payload["ok"] as? Bool ?? false
        guard let checkIn = store.retryable.first(where: { $0.id == clientId })
            ?? (store.lastCaptured?.id == clientId ? store.lastCaptured : nil)
        else { return }
        store.markState(ok ? .saved : .failed, for: checkIn)
    }

    private func route(_ payload: [String: Any]) {
        switch payload["type"] as? String {
        case "context": handle(context: payload)
        case "ack": handle(ack: payload)
        default: break
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            self.retryPending()
            self.requestContext()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            if reachable {
                self.retryPending()
                self.requestContext()
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.route(message) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in self.route(message) }
        replyHandler([:])
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.route(userInfo) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.route(applicationContext) }
    }
}
