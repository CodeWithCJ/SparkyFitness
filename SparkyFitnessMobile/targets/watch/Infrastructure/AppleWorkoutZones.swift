import Foundation
import HealthKit

/// Heart-rate zone totals HealthKit already computed for a finished workout.
///
/// watchOS 27 only. Older toolchains compile this as "no zones", the same way
/// the phone's Apple heart-zones module does, so a watch built with an older
/// SDK still finishes workouts.
enum AppleWorkoutZones {
    static func heartRateZones(of workout: HKWorkout) -> [[String: Any]] {
        #if compiler(>=6.4)
        if #available(watchOS 27.0, *) {
            return read(workout)
        }
        #endif
        return []
    }
}

#if compiler(>=6.4)
@available(watchOS 27.0, *)
private func read(_ workout: HKWorkout) -> [[String: Any]] {
    guard let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate),
          let group = workout.zoneGroupsByType?[heartRate]
    else { return [] }

    let bpm = HKUnit.count().unitDivided(by: .minute())
    let zones: [[String: Any]] = group.zoneDurations.map { duration in
        var row: [String: Any] = [
            "index": duration.zone.index,
            "seconds": duration.duration,
        ]
        if let minimum = duration.zone.minimum {
            row["minimumBpm"] = minimum.doubleValue(for: bpm)
        }
        if let maximum = duration.zone.maximum {
            row["maximumBpm"] = maximum.doubleValue(for: bpm)
        }
        return row
    }
    return zones.count == 5 ? zones : []
}
#endif
