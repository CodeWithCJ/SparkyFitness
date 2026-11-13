import Foundation
import HealthKit

/// Apple's 1-10 workout effort rating (watchOS 11+), shared by the strength
/// and cardio endings so both save it the same way.
enum WorkoutEffort {
    /// True when this watchOS can attach a rating to a saved workout.
    static var isSupported: Bool {
        if #available(watchOS 11.0, *) { return true }
        return false
    }

    /// Attaches `score` (clamped to 1-10) to `workout`, so it shows in Fitness
    /// and Health. Completion is on the main queue with whether it was saved.
    static func save(
        _ score: Int,
        for workout: HKWorkout,
        in healthStore: HKHealthStore,
        completion: @escaping (Bool) -> Void
    ) {
        guard #available(watchOS 11.0, *) else {
            completion(false)
            return
        }
        let sample = HKQuantitySample(
            type: HKQuantityType(.workoutEffortScore),
            quantity: HKQuantity(unit: .appleEffortScore(), doubleValue: Double(min(max(score, 1), 10))),
            start: workout.startDate,
            end: workout.endDate
        )
        // Same as the other metrics: write only with a granted permission, and
        // ask right before the write when Health does not report one. Asking
        // when the workout starts did not hold, so the rating was refused.
        let effortType = HKQuantityType(.workoutEffortScore)
        let write = {
            healthStore.relateWorkoutEffortSample(sample, with: workout, activity: nil) { success, _ in
                DispatchQueue.main.async { completion(success) }
            }
        }
        if healthStore.authorizationStatus(for: effortType) == .sharingAuthorized {
            write()
        } else {
            healthStore.requestAuthorization(toShare: [effortType], read: []) { _, _ in write() }
        }
    }
}
