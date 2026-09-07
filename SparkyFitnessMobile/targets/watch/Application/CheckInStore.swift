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
    /// Container taps sent to the phone but not yet reflected in a pushed
    /// total. Kept here rather than in the Water page so they outlive both the
    /// page and the app process — a tap made with the phone in another room
    /// can wait a long while for its confirmation, and until then this is the
    /// only record that it happened.
    @Published private(set) var pendingWaterTaps: [PendingWaterTap] = []

    private let defaults = UserDefaults.standard
    private let contextKey = "sparky.watch.context"
    private let pendingKey = "sparky.watch.pending"
    private let lastCapturedKey = "sparky.watch.lastCaptured"
    private let pendingWaterKey = "sparky.watch.pendingWaterTaps"

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

    // MARK: - Water

    /// Records an optimistic tap and returns nothing — the bottle reads
    /// `pendingWaterTaps` directly, and the id only matters to `apply`.
    func recordWaterTap(volumeMl: Double) {
        pendingWaterTaps.append(
            PendingWaterTap(
                id: UUID().uuidString,
                volumeMl: volumeMl,
                createdAt: Date(),
                day: CheckInDate.today()
            )
        )
        persist()
    }

    /// Total still awaiting confirmation, added to the day's real total for
    /// display.
    var pendingWaterMl: Double {
        pendingWaterTaps.reduce(0) { $0 + $1.volumeMl }
    }

    // MARK: - Phone updates

    func apply(context incoming: WatchContext) {
        context = incoming
        // Applied here rather than only from the callers' own prune calls,
        // because an inbound context is not always a fresh one: an
        // `adoptReceivedContext()` replay hands back whatever the phone last
        // set, which on the first launch of a morning is still yesterday's.
        // With the prune outside, `ContentView.onAppear` cleared the stale day
        // and the replay two lines later put it straight back.
        //
        // Every inbound path now goes through one rule, and the store cannot
        // hold a day that has ended regardless of who applied it.
        clearStaleDayData()

        // Clears the optimistic taps a total has had the chance to account
        // for — those made before the phone built it.
        //
        // Not simply "a today-snapshot arrived, drop everything": an inbound
        // context is not always a fresh one. `adoptReceivedContext()` replays
        // whatever the phone last set, so re-opening the app minutes after a
        // tap re-applied this morning's cached total and wiped a tap that was
        // still sitting in the outbox, un-written. The bump vanished from the
        // bottle while the tap was very much still pending.
        //
        // Not "the total changed" either: two taps of the same container
        // between pushes leave the total looking untouched by that test, and
        // the taps would sit in the bottle forever.
        //
        // Both clocks are involved, so a phone/watch skew can clear a tap a
        // moment early or late. Bounded and self-correcting — the next push
        // settles the bottle on the server's number either way — where the
        // previous rule lost the tap outright.
        if context.water?.isToday == true, !pendingWaterTaps.isEmpty {
            if let generatedAt = context.generatedAt {
                pendingWaterTaps.removeAll { $0.createdAt <= generatedAt }
            } else {
                // A phone build from before `pushedAt` existed. Nothing to
                // reason with, so keep the old behaviour rather than letting
                // taps accumulate with no way out.
                pendingWaterTaps.removeAll()
            }
        }

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

    // MARK: - Day rollover

    /// Drops nutrition and water snapshots that describe a day now past.
    ///
    /// Both are already guarded where they're displayed (`isToday`), but that
    /// guard is time-dependent while SwiftUI only re-evaluates a view when
    /// observed state changes — and midnight changes nothing observable. With
    /// the phone out of range no context arrives either, so a watch left
    /// running overnight kept rendering yesterday's totals: the guard was
    /// simply never asked again. The complication has no such problem, being
    /// a separate process WidgetKit re-renders on its own timeline, which is
    /// why it read zero while the page still showed yesterday.
    ///
    /// Clearing the data rather than merely forcing a redraw is deliberate:
    /// it publishes a real change, so every dependent view recomputes, and it
    /// stops the persisted context carrying numbers that are no longer true
    /// into the next launch.
    ///
    /// Weight and body-fat history is deliberately left alone — unlike
    /// today's totals, it doesn't expire at midnight.
    func pruneStaleDayData() {
        guard clearStaleDayData() else { return }
        persist()
    }

    /// Drops the stale snapshots and reports whether anything went, leaving
    /// persistence to the caller — `apply(context:)` writes once at the end
    /// either way, and a second write there would be pure waste.
    @discardableResult
    private func clearStaleDayData() -> Bool {
        var changed = false

        if let nutrition = context.nutrition, !nutrition.isToday {
            context.nutrition = nil
            changed = true
        }
        if let water = context.water, !water.isToday {
            context.water = nil
            changed = true
        }
        // Yesterday's unconfirmed taps are yesterday's problem — carrying them
        // into a new day would show a bottle part-full before a drop was drunk.
        // Keyed on each tap's own day, not on the water snapshot: an unsynced
        // today has no snapshot either, and this morning's taps must survive
        // exactly that case.
        if pendingWaterTaps.contains(where: { !$0.isToday }) {
            pendingWaterTaps.removeAll { !$0.isToday }
            changed = true
        }

        return changed
    }

    // MARK: - Persistence

    private func persist() {
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(context) { defaults.set(data, forKey: contextKey) }
        if let data = try? encoder.encode(pending) { defaults.set(data, forKey: pendingKey) }
        if let last = lastCaptured, let data = try? encoder.encode(last) {
            defaults.set(data, forKey: lastCapturedKey)
        }
        if let data = try? encoder.encode(pendingWaterTaps) {
            defaults.set(data, forKey: pendingWaterKey)
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

        if let data = defaults.data(forKey: pendingWaterKey),
           let decoded = try? decoder.decode([PendingWaterTap].self, from: data) {
            pendingWaterTaps = decoded
        }

        // What was just restored may describe a day that has since ended —
        // the app can be relaunched any number of days after it last ran.
        pruneStaleDayData()
    }
}
