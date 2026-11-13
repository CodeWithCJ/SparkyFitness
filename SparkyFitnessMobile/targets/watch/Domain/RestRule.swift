import Foundation

/// What `RestRule` needs to know about one set of the running order.
struct RestStepFacts: Equatable {
    let exerciseEntryId: String
    let supersetRun: Int?
    /// 1-based position within its own exercise.
    let setNumber: Int
    let isDrop: Bool
    /// The set's own rest (`PlannedSet.restAfterSeconds`); nil from an older phone.
    let ownRestSeconds: Int?
    /// The phone's rest before this set (`PlannedSet.restSeconds`).
    let restBeforeSeconds: Int
}

/// The rest the phone runs after a set is logged: a mirror of
/// `restSecBeforeNextSet` in activeWorkoutStore.ts.
///
/// - the set that comes next is a drop set: 0;
/// - it is another member of the same superset run in the same round: 0;
/// - otherwise the completed set's own rest, so the timer after an exercise's
///   last set uses that set's rest, not the next exercise's.
///
/// A phone that does not send the set's own rest leaves the old behaviour, the
/// rest before the next set.
enum RestRule {
    static func restAfter(completed: RestStepFacts, next: RestStepFacts) -> Int {
        guard let own = completed.ownRestSeconds else { return next.restBeforeSeconds }
        if next.isDrop { return 0 }
        if let run = next.supersetRun,
           completed.supersetRun == run,
           completed.exerciseEntryId != next.exerciseEntryId,
           completed.setNumber == next.setNumber {
            return 0
        }
        return own
    }
}
