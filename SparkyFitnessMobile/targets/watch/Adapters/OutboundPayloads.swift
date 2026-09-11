import Foundation

/// Turns domain values into the dictionaries WatchConnectivity carries to the
/// phone.
///
/// These `payload` builders used to be computed properties on `CheckIn`,
/// `WaterTap` and `WaterDeleteRequest` themselves, which meant the domain
/// types knew their own wire format — a check-in had an opinion about the
/// string `"weightKg"`. Moving them here leaves those types as plain values
/// and puts every outbound key in one place, next to the `type` strings the
/// phone's router switches on.
///
/// The counterpart for the other direction is `ContextPayloadMapper`.
enum OutboundPayloads {

    /// Message types, matched by the phone's native module router
    /// (`WatchConnectivityModule.route`). Renaming one here without renaming
    /// it there means the phone silently ignores the message.
    private enum Kind {
        static let checkIn = "checkIn"
        static let waterIntake = "waterIntake"
        static let waterDelete = "waterDelete"
        static let contextRequest = "requestContext"
    }

    /// A morning check-in awaiting a server write.
    ///
    /// `bodyFatPercentage` is OMITTED rather than sent as null when the wearer
    /// skipped it: the server upserts by date, so a null would erase whatever
    /// body-fat value the day already had instead of leaving it alone.
    static func checkIn(_ checkIn: CheckIn) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.checkIn,
            "clientId": checkIn.id,
            "entryDate": checkIn.entryDate,
            "weightKg": checkIn.weightKg,
        ]
        if let bodyFat = checkIn.bodyFatPercentage {
            payload["bodyFatPercentage"] = bodyFat
        }
        return payload
    }

    /// One tap on a container square — the phone turns this into one serving
    /// of `containerId`, the same amount its own +/- button would add.
    static func waterTap(_ tap: WaterTap) -> [String: Any] {
        [
            "type": Kind.waterIntake,
            "clientId": tap.id,
            "entryDate": tap.entryDate,
            "containerId": tap.containerId,
        ]
    }

    /// A request to delete one logged drink by its server row id.
    static func waterDelete(_ request: WaterDeleteRequest) -> [String: Any] {
        [
            "type": Kind.waterDelete,
            "clientId": request.id,
            "entryId": request.entryId,
        ]
    }

    /// Asks the phone to push a fresh context. Carries no data of its own.
    static let contextRequest: [String: Any] = ["type": Kind.contextRequest]
}
