import Foundation
import Combine

/// The watch's own record of what was captured, plus whatever the phone has
/// relayed. Deliberately the source of truth: the wearer is standing on a scale
/// in a bathroom with the phone in another room, so "captured" and "delivered"
/// are different events and only the first is under our control.
@MainActor
final class CheckInStore: ObservableObject {
    static let shared = CheckInStore()

    /// Seed values + history relayed from the phone.
    @Published private(set) var context: WatchContext = .empty
    /// Captured but not yet confirmed written to the server, oldest first.
    @Published private(set) var pending: [CheckIn] = []
    /// The most recent capture, kept so the trend screen can show it and its
    /// state even after the ack arrives and it leaves `pending`.
    @Published private(set) var lastCaptured: CheckIn?
    @Published private(set) var lastCapturedState: SyncState = .saved

    private let defaults = UserDefaults.standard
    private let contextKey = "sparky.watch.context"
    private let pendingKey = "sparky.watch.pending"
    private let lastCapturedKey = "sparky.watch.lastCaptured"

    private init() {
        load()
    }

    // MARK: - Seeding

    /// The value the Digital Crown starts on. Today's entry wins over history so
    /// re-logging is a correction of the right number, not a fresh guess.
    var seedWeightKg: Double? {
        if let pendingToday = pending.last(where: { $0.entryDate == CheckInDate.today() }) {
            return pendingToday.weightKg
        }
        return context.todayWeightKg ?? context.lastWeightKg
    }

    var seedBodyFatPercentage: Double? {
        if let pendingToday = pending.last(where: { $0.entryDate == CheckInDate.today() }),
           let fat = pendingToday.bodyFatPercentage {
            return fat
        }
        return context.todayBodyFatPercentage ?? context.lastBodyFatPercentage
    }

    /// True when today already has a value — the header then reads "replacing"
    /// so an overwrite is never silent.
    var isReplacingToday: Bool {
        if pending.contains(where: { $0.entryDate == CheckInDate.today() }) { return true }
        return context.todayWeightKg != nil && context.today == CheckInDate.today()
    }

    /// The value the delta line compares against. Nil on first-ever use.
    var comparisonWeightKg: Double? { context.lastWeightKg }

    var needsFirstRunEntry: Bool { !context.hasSeed || context.isSeedStale }

    // MARK: - Capture

    /// Records a check-in locally and returns it so the caller can hand it to
    /// WatchConnectivity. Never throws and never blocks on reachability — the
    /// Save tap is always terminal.
    func capture(weightKg: Double, bodyFatPercentage: Double?) -> CheckIn {
        let checkIn = CheckIn(
            id: UUID().uuidString,
            entryDate: CheckInDate.today(),
            weightKg: weightKg,
            bodyFatPercentage: bodyFatPercentage,
            capturedAt: Date()
        )
        pending.append(checkIn)
        lastCaptured = checkIn
        lastCapturedState = .queued
        persist()
        return checkIn
    }

    func markState(_ state: SyncState, for checkIn: CheckIn) {
        if lastCaptured?.id == checkIn.id {
            lastCapturedState = state
        }
        if state == .saved {
            pending.removeAll { $0.id == checkIn.id }
        }
        persist()
    }

    // MARK: - Phone updates

    func apply(context incoming: WatchContext) {
        context = incoming
        // Acks ride along in the context so they still arrive if the watch app
        // was asleep when the server write completed.
        let acked = Set(incoming.ackedClientIds)
        if !acked.isEmpty {
            if let last = lastCaptured, acked.contains(last.id) {
                lastCapturedState = .saved
            }
            pending.removeAll { acked.contains($0.id) }
        }
        persist()
    }

    /// Check-ins still awaiting delivery, for the retry path.
    var retryable: [CheckIn] { pending }

    // MARK: - Trend data

    /// History from the server, overlaid with anything captured locally that the
    /// server hasn't confirmed yet — so today's point appears immediately.
    func trendPoints(limit: Int = 14) -> [HistoryPoint] {
        var byDay: [String: HistoryPoint] = [:]
        for point in context.history {
            byDay[point.day] = point
        }
        for checkIn in pending {
            byDay[checkIn.entryDate] = HistoryPoint(
                day: checkIn.entryDate,
                weightKg: checkIn.weightKg,
                bodyFatPercentage: checkIn.bodyFatPercentage
                    ?? byDay[checkIn.entryDate]?.bodyFatPercentage
            )
        }
        if let last = lastCaptured, lastCapturedState == .saved {
            byDay[last.entryDate] = HistoryPoint(
                day: last.entryDate,
                weightKg: last.weightKg,
                bodyFatPercentage: last.bodyFatPercentage
                    ?? byDay[last.entryDate]?.bodyFatPercentage
            )
        }
        return byDay.values
            .sorted { $0.day < $1.day }
            .suffix(limit)
    }

    /// True when today's point should be drawn hollow — captured here but not
    /// yet acknowledged by the phone.
    func isDayUnconfirmed(_ day: String) -> Bool {
        pending.contains { $0.entryDate == day }
    }

    /// Centred 7-day rolling mean. The wearer verifies the *shape* of the
    /// corridor rather than re-reading the digits, which works on a
    /// barely-awake brain.
    func rollingMean(points: [HistoryPoint], window: Int = 7) -> [HistoryPoint] {
        guard points.count >= 2 else { return [] }
        let half = window / 2
        return points.indices.map { index in
            let lower = max(0, index - half)
            let upper = min(points.count - 1, index + half)
            let slice = points[lower...upper]
            let mean = slice.reduce(0.0) { $0 + $1.weightKg } / Double(slice.count)
            return HistoryPoint(day: points[index].day, weightKg: mean, bodyFatPercentage: nil)
        }
    }

    // MARK: - Persistence

    private func persist() {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(context) { defaults.set(data, forKey: contextKey) }
        if let data = try? encoder.encode(pending) { defaults.set(data, forKey: pendingKey) }
        if let last = lastCaptured, let data = try? encoder.encode(last) {
            defaults.set(data, forKey: lastCapturedKey)
        }
    }

    private func load() {
        let decoder = JSONDecoder()
        if let data = defaults.data(forKey: contextKey),
           let decoded = try? decoder.decode(WatchContext.self, from: data) {
            context = decoded
        }
        if let data = defaults.data(forKey: pendingKey),
           let decoded = try? decoder.decode([CheckIn].self, from: data) {
            pending = decoded
        }
        if let data = defaults.data(forKey: lastCapturedKey),
           let decoded = try? decoder.decode(CheckIn.self, from: data) {
            lastCaptured = decoded
            lastCapturedState = pending.contains(where: { $0.id == decoded.id }) ? .queued : .saved
        }
    }
}
