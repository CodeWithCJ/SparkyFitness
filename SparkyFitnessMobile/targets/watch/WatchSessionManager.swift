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
        WCSession.default.transferUserInfo(tap.payload)
    }

    /// Asks the phone to delete one logged drink. Same fire-and-reconcile
    /// contract as `sendWaterTap`: no ack comes back, the water log view has
    /// already hidden the row, and the next context push either confirms that
    /// (row gone) or restores it (delete failed).
    func sendWaterDelete(entryId: String) {
        guard WCSession.isSupported() else { return }
        let request = WaterDeleteRequest(id: UUID().uuidString, entryId: entryId)
        WCSession.default.transferUserInfo(request.payload)
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
    /// Stale contexts are skipped rather than republished: both syncs stamp
    /// the snapshot with today's date, so writing yesterday's numbers would
    /// relabel them as today's. Leaving the old snapshot in place lets the
    /// widgets' own date checks fall back to empty, which is the honest
    /// answer.
    func refreshComplications() {
        let context = store.context

        if let nutrition = context.nutrition, nutrition.isToday {
            EnergyGoalSync.write(
                calorieGoalProgress: nutrition.calorieProgress,
                proteinGoalProgress: nutrition.protein.progress,
                carbsGoalProgress: nutrition.carbs.progress,
                fatGoalProgress: nutrition.fat.progress
            )
        }

        if let water = context.water, water.isToday {
            WaterGoalSync.write(progress: water.progress)
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

        let nutrition = parseNutrition(from: payload)
        let water = parseWater(from: payload)
        // `apply(context:)` replaces the stored context wholesale, so a push
        // that carried no container key would otherwise erase the list. Fall
        // back to what's already held: stale containers are still correct
        // ones, and losing them strands the Water page.
        let containers = parseWaterContainers(from: payload) ?? store.context.waterContainers

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
            weightUnit: (payload["weightUnit"] as? String).flatMap(WeightUnit.init(rawValue:)),
            nutrition: nutrition,
            water: water,
            waterContainers: containers
        )
        store.apply(context: incoming)

        // The complication is a separate process and cannot read this app's own
        // storage, only the shared App Group — so the same numbers go out a
        // second time, from the raw payload, regardless of what the snapshot
        // above did with them.
        EnergyGoalSync.write(
            calorieGoalProgress: payload["calorieGoalProgress"] as? Double ?? 0,
            proteinGoalProgress: payload["proteinGoalProgress"] as? Double ?? 0,
            carbsGoalProgress: payload["carbsGoalProgress"] as? Double ?? 0,
            fatGoalProgress: payload["fatGoalProgress"] as? Double ?? 0
        )

        // Same one-way relay for the Water Intake complication. Computed here
        // rather than sent pre-clamped by the phone (the way the macro
        // fractions are) because the two water figures already travel for the
        // Water page's own bottle — a third field carrying their ratio would
        // be a second version of the same truth to keep in step.
        WaterGoalSync.write(progress: water?.progress ?? 0)
    }

    /// Reassembles the flat nutrition keys into a structured snapshot. Only
    /// built when the phone actually sent totals — an older phone build, or
    /// one whose Dashboard hasn't loaded yet, sends none of them, and the
    /// Goals page should say so rather than show a wall of honest-looking
    /// zeros.
    private func parseNutrition(from payload: [String: Any]) -> NutritionSnapshot? {
        func value(_ key: String) -> Double? { payload[key] as? Double }
        guard
            let consumed = value("caloriesConsumed"),
            let burned = value("caloriesBurned"),
            let remaining = value("caloriesRemaining")
        else { return nil }
        return NutritionSnapshot(
            day: payload["today"] as? String ?? CheckInDate.today(),
            caloriesConsumed: consumed,
            caloriesBurned: burned,
            caloriesRemaining: remaining,
            calorieProgress: value("calorieGoalProgress") ?? 0,
            carbs: MacroGoal(
                consumed: value("carbsConsumed") ?? 0,
                goal: value("carbsGoal") ?? 0,
                progress: value("carbsGoalProgress") ?? 0
            ),
            fat: MacroGoal(
                consumed: value("fatConsumed") ?? 0,
                goal: value("fatGoal") ?? 0,
                progress: value("fatGoalProgress") ?? 0
            ),
            protein: MacroGoal(
                consumed: value("proteinConsumed") ?? 0,
                goal: value("proteinGoal") ?? 0,
                progress: value("proteinGoalProgress") ?? 0
            )
        )
    }

    /// Reassembles today's water totals. Only built when the phone sent both
    /// figures — a partial snapshot would render as a confident zero.
    ///
    /// Containers are parsed separately (`parseWaterContainers`) and live on
    /// the context rather than in here, so they outlive the day this snapshot
    /// describes.
    private func parseWater(from payload: [String: Any]) -> WaterSnapshot? {
        guard
            let consumedMl = payload["waterConsumedMl"] as? Double,
            let goalMl = payload["waterGoalMl"] as? Double
        else { return nil }

        let rawLog = payload["waterLog"] as? [[String: Any]] ?? []
        let log = rawLog.compactMap { entry -> WaterLogEntry? in
            guard
                let id = entry["id"] as? String,
                let name = entry["name"] as? String,
                let volumeMl = entry["volumeMl"] as? Double,
                let time = entry["time"] as? String
            else { return nil }
            return WaterLogEntry(id: id, name: name, volumeMl: volumeMl, time: time)
        }

        return WaterSnapshot(
            day: payload["today"] as? String ?? CheckInDate.today(),
            consumedMl: consumedMl,
            goalMl: goalMl,
            log: log,
            displayUnit: payload["waterDisplayUnit"] as? String ?? "ml"
        )
    }

    /// The configured containers, or nil when this push didn't carry the key
    /// at all.
    ///
    /// Nil and empty mean different things and the caller relies on it: an
    /// absent key is an older phone build (or a payload that failed to
    /// include them) and must leave whatever the watch already has alone,
    /// while an empty array is the phone actively saying there are none. A
    /// single `?? []` here would quietly turn the first case into the second
    /// and wipe a perfectly good list.
    private func parseWaterContainers(from payload: [String: Any]) -> [WaterContainer]? {
        guard let raw = payload["containers"] as? [[String: Any]] else { return nil }
        return raw.compactMap { entry -> WaterContainer? in
            guard
                let id = entry["id"] as? Int,
                let name = entry["name"] as? String,
                let servingVolumeMl = entry["servingVolumeMl"] as? Double,
                let unit = entry["unit"] as? String
            else { return nil }
            return WaterContainer(id: id, name: name, servingVolumeMl: servingVolumeMl, unit: unit)
        }
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
