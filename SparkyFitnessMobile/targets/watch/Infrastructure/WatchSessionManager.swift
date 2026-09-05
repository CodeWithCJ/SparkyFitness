import Foundation
import WatchConnectivity
import Combine

/// Watch-side WatchConnectivity wrapper: session lifecycle, the outbound
/// sends, and routing whatever arrives.
///
/// Deliberately does NOT know any wire keys. Inbound dictionaries are turned
/// into domain values by `ContextPayloadMapper`, outbound ones are built by
/// `OutboundPayloads`, and the complications are fed through
/// `ComplicationPublisher`. What's left here is the part that genuinely needs
/// `WCSession`, which is why this file went from four jobs to one.
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
        WCSession.default.transferUserInfo(OutboundPayloads.checkIn(checkIn))
        return .queued
    }

    /// Re-queues everything still unconfirmed. Used by the retry affordance and
    /// on app launch, since a transfer can be lost if the app was force-quit.
    func retryPending() {
        guard WCSession.isSupported() else { return }
        for checkIn in store.retryable {
            WCSession.default.transferUserInfo(OutboundPayloads.checkIn(checkIn))
        }
    }

    /// Logs one full serving of `containerId` against today, straight to the
    /// server — there is no local-only increment. Uses the same queued
    /// delivery as a check-in (`send(_:)`) and for the same reason: the
    /// wearer is realistically drinking from wherever the phone isn't.
    ///
    /// Unlike a check-in, this is never acknowledged back. A tap that fails to
    /// write simply doesn't show up in the next context push, and the Water
    /// page's own optimistic bump settles back down once that push arrives
    /// (or its short local timeout elapses) — an accepted tradeoff for making
    /// a tap feel instant rather than gating it on a phone round trip.
    func sendWaterTap(containerId: Int) {
        guard WCSession.isSupported() else { return }
        let tap = WaterTap(
            id: UUID().uuidString,
            entryDate: CheckInDate.today(),
            containerId: containerId
        )
        WCSession.default.transferUserInfo(OutboundPayloads.waterTap(tap))
    }

    /// Asks the phone to delete one logged drink. Same fire-and-reconcile
    /// contract as `sendWaterTap`: no ack comes back, the water log view has
    /// already hidden the row, and the next context push either confirms that
    /// (row gone) or restores it (delete failed).
    func sendWaterDelete(entryId: String) {
        guard WCSession.isSupported() else { return }
        let request = WaterDeleteRequest(id: UUID().uuidString, entryId: entryId)
        WCSession.default.transferUserInfo(OutboundPayloads.waterDelete(request))
    }

    /// Re-publishes both complications' shared-storage snapshots from the
    /// context the watch already holds.
    ///
    /// Without this, a complication's data depended entirely on a *fresh*
    /// context arriving from the phone, because `handle(context:)` was the
    /// only thing that ever wrote to the App Group. The app's own pages don't
    /// have that dependency — `CheckInStore` persists the context and
    /// restores it at launch — so the Water page could sit there reading 40%
    /// from disk while the complication showed 0%, having never been written
    /// at all. That happens on any launch where the phone app isn't in the
    /// foreground: `requestContext()` bails on `isReachable` and no push
    /// comes.
    ///
    /// Stale contexts are skipped rather than republished: the publisher
    /// stamps every snapshot with today's date, so writing yesterday's numbers
    /// would relabel them as today's. Leaving the old snapshot in place lets
    /// the widgets' own date checks fall back to empty, which is the honest
    /// answer.
    ///
    /// This is the one path that feeds the complications from the store rather
    /// than from a payload — see `handle(context:)` for the normal one.
    func refreshComplications() {
        let context = store.context

        // The `isToday` checks are now belt to the publisher's braces — it
        // rejects a non-today `day` itself. Kept because they also skip the
        // pointless work of building a snapshot that would be discarded.
        if let nutrition = context.nutrition, nutrition.isToday {
            ComplicationPublisher.publish(
                goals: GoalProgress(
                    calories: nutrition.calorieProgress,
                    protein: nutrition.protein.progress,
                    carbs: nutrition.carbs.progress,
                    fat: nutrition.fat.progress
                ),
                for: nutrition.day
            )
        }

        if let water = context.water, water.isToday {
            ComplicationPublisher.publish(waterProgress: water.progress, for: water.day)
        }
    }

    /// Adopts the application context WatchConnectivity is already holding.
    ///
    /// `didReceiveApplicationContext` fires only for *new* updates, so the
    /// most recent context the phone set — sitting in
    /// `receivedApplicationContext` the whole time — was never read. That
    /// left a gap with no way out of it: a fresh install (every rebuild from
    /// Xcode is one) starts with empty storage, the phone has nothing new to
    /// say so says nothing, and opening the phone app re-pushes a dictionary
    /// identical to the one already set, which the system declines to
    /// redeliver. The watch would sit there with no containers indefinitely
    /// while the data it needed was one property access away.
    ///
    /// Safe to call repeatedly: it routes through the same handler a live
    /// push does, and an unchanged context simply re-applies the same values.
    func adoptReceivedContext() {
        guard WCSession.isSupported() else { return }
        let received = WCSession.default.receivedApplicationContext
        guard !received.isEmpty else { return }
        route(received)
    }

    /// Asks the phone for a fresh context (seed values + history). Only works
    /// while the phone app is running, so the cached context is always the
    /// fallback.
    func requestContext() {
        guard WCSession.isSupported(), WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(
            OutboundPayloads.contextRequest,
            replyHandler: nil,
            errorHandler: nil
        )
    }

    /// Applies an inbound context: into the app's own store, and — separately
    /// — out to the complications.
    ///
    /// The two sinks are siblings fed from the same payload, not a chain. The
    /// complication runs in another process and cannot read this app's
    /// storage, so the numbers genuinely go out twice. That independence is
    /// also why they can disagree, which is what `refreshComplications()`
    /// above exists to repair.
    private func handle(context payload: [String: Any]) {
        let incoming = ContextPayloadMapper.context(
            from: payload,
            previousContainers: store.context.waterContainers
        )
        store.apply(context: incoming)

        // The day this payload is ABOUT — not necessarily today. Anything
        // routed through here may be a replay of the cached context by
        // `adoptReceivedContext()`, which on the first launch of a morning is
        // still yesterday's. Passing the day is what lets the publisher tell
        // a genuinely fresh push from a rerun of an old one.
        let day = ContextPayloadMapper.day(from: payload)

        ComplicationPublisher.publish(
            goals: ContextPayloadMapper.goalProgress(from: payload),
            for: day
        )
        // Derived from the parsed snapshot rather than a dedicated payload
        // field: the two water figures already travel for the Water page's
        // bottle, and a third field carrying their ratio would be a second
        // version of the same truth to keep in step.
        ComplicationPublisher.publish(waterProgress: incoming.water?.progress ?? 0, for: day)
    }

    /// Marks one check-in saved or failed once the phone reports the server
    /// write. Ignores an ack for a check-in this watch no longer tracks — a
    /// re-delivered transfer for something already reconciled.
    private func handle(ack payload: [String: Any]) {
        guard let ack = ContextPayloadMapper.ack(from: payload) else { return }
        guard let checkIn = store.retryable.first(where: { $0.id == ack.clientId })
            ?? (store.lastCaptured?.id == ack.clientId ? store.lastCaptured : nil)
        else { return }
        store.markState(ack.ok ? .saved : .failed, for: checkIn)
    }

    /// The single entry point for everything inbound, whichever transport
    /// delivered it — a live push, a queued message, or the locally cached
    /// context read by `adoptReceivedContext()`.
    private func route(_ payload: [String: Any]) {
        switch ContextPayloadMapper.type(of: payload) {
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
            // Before asking the phone for anything: whatever it last sent is
            // already available locally, and unlike `requestContext()` this
            // works with the phone nowhere in sight.
            self.adoptReceivedContext()
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
