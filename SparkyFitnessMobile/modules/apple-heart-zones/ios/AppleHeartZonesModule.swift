import ExpoModulesCore
import HealthKit

// Reads the heart-rate zones the person set in the Health app (or the zones
// Apple generated for them). Those zones are not a HealthKit sample, so the
// existing quantity sync cannot see them. The API is iOS 27; older toolchains
// compile this module with `isAvailable` false and the read returning nil.
public class AppleHeartZonesModule: Module {
    public func definition() -> ModuleDefinition {
        Name("AppleHeartZones")

        Function("isAvailable") { () -> Bool in
            #if compiler(>=6.4)
            if #available(iOS 27.0, *) {
                return HKHealthStore.isHealthDataAvailable()
            }
            #endif
            return false
        }

        AsyncFunction("preferredHeartRateZones") { () -> [String: Any]? in
            #if compiler(>=6.4)
            if #available(iOS 27.0, *) {
                return await preferredHeartRateZones()
            }
            #endif
            return nil
        }

        // Zone totals Apple already computed for finished workouts. The
        // quantity sync cannot see them; they live on the HKWorkout.
        AsyncFunction("heartRateZonesForWorkouts") { (uuids: [String]) -> [[String: Any]] in
            #if compiler(>=6.4)
            if #available(iOS 27.0, *) {
                return await heartRateZones(forWorkoutUUIDs: uuids)
            }
            #endif
            return []
        }
    }
}

#if compiler(>=6.4)
@available(iOS 27.0, *)
private func preferredHeartRateZones() async -> [String: Any]? {
    guard HKHealthStore.isHealthDataAvailable(),
          let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate)
    else { return nil }

    let config: HKWorkoutZoneConfiguration?
    do {
        config = try await HKHealthStore().preferredWorkoutZoneConfiguration(for: heartRate)
    } catch {
        return nil
    }
    guard let config else { return nil }

    let bpm = HKUnit.count().unitDivided(by: .minute())
    let zones: [[String: Any]] = config.zones.map { zone in
        var row: [String: Any] = ["index": zone.index]
        if let minimum = zone.minimum {
            row["minimumBpm"] = minimum.doubleValue(for: bpm)
        }
        if let maximum = zone.maximum {
            row["maximumBpm"] = maximum.doubleValue(for: bpm)
        }
        return row
    }
    let sourceName: String
    switch config.source {
    case .system:
        sourceName = "system"
    case .user:
        sourceName = "user"
    case .app:
        sourceName = "app"
    @unknown default:
        sourceName = "unknown"
    }
    return ["source": sourceName, "zones": zones]
}

@available(iOS 27.0, *)
private func heartRateZones(forWorkoutUUIDs uuids: [String]) async -> [[String: Any]] {
    let ids = Array(Set(uuids.compactMap { UUID(uuidString: $0) })).prefix(50)
    guard !ids.isEmpty,
          HKHealthStore.isHealthDataAvailable(),
          let heartRate = HKQuantityType.quantityType(forIdentifier: .heartRate)
    else { return [] }

    let store = HKHealthStore()
    let predicate = HKQuery.predicateForObjects(with: Set(ids))
    let samples: [HKSample] = await withCheckedContinuation { continuation in
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: predicate,
            limit: ids.count,
            sortDescriptors: nil
        ) { _, found, _ in
            continuation.resume(returning: found ?? [])
        }
        store.execute(query)
    }

    let bpm = HKUnit.count().unitDivided(by: .minute())
    return samples.compactMap { sample in
        guard let workout = sample as? HKWorkout,
              let group = workout.zoneGroupsByType?[heartRate]
        else { return nil }
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
        guard zones.count == 5 else { return nil }
        return ["uuid": workout.uuid.uuidString, "zones": zones]
    }
}
#endif
