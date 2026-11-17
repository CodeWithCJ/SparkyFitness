import Foundation

/// Tells a phone rest the wearer already skipped here from one that began
/// after the skip.
///
/// The phone times a rest from the set's log tick and may run it for a
/// different length than the watch's guess, so it can ignore a Skip whose
/// "before" deadline is not within its tolerance of its own. Its update then
/// brings back a rest the wrist already ended. A rest that began at or before
/// the skip is that one coming back; a later one is new.
enum StaleRest {
    static func isStale(endsAt: Date, durationSeconds: Int, skippedAt: Date?) -> Bool {
        guard let skippedAt else { return false }
        return endsAt.addingTimeInterval(-TimeInterval(durationSeconds)) <= skippedAt
    }
}
