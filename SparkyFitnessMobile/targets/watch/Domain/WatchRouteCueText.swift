import Foundation

/// How a route cue reads on the wrist and aloud. The words are the watch's own
/// (translated); a route that carries its own `text` ("Turn left onto Mill
/// Lane") wins over them.
extension WatchRouteCueKind {
    var symbol: String {
        switch self {
        case .depart, .straight: return "arrow.up"
        case .slightLeft: return "arrow.up.left"
        case .left: return "arrow.turn.up.left"
        case .sharpLeft: return "arrow.turn.down.left"
        case .slightRight: return "arrow.up.right"
        case .right: return "arrow.turn.up.right"
        case .sharpRight: return "arrow.turn.down.right"
        case .uturn: return "arrow.uturn.down"
        case .arrive: return "flag.checkered"
        }
    }

    var title: String {
        switch self {
        case .depart: return String(localized: "watch.route.cue.depart", defaultValue: "Start")
        case .straight: return String(localized: "watch.route.cue.straight", defaultValue: "Continue straight")
        case .slightLeft: return String(localized: "watch.route.cue.slightLeft", defaultValue: "Bear left")
        case .left: return String(localized: "watch.route.cue.left", defaultValue: "Turn left")
        case .sharpLeft: return String(localized: "watch.route.cue.sharpLeft", defaultValue: "Sharp left")
        case .slightRight: return String(localized: "watch.route.cue.slightRight", defaultValue: "Bear right")
        case .right: return String(localized: "watch.route.cue.right", defaultValue: "Turn right")
        case .sharpRight: return String(localized: "watch.route.cue.sharpRight", defaultValue: "Sharp right")
        case .uturn: return String(localized: "watch.route.cue.uturn", defaultValue: "Make a U-turn")
        case .arrive: return String(localized: "watch.route.cue.arrive", defaultValue: "Finish")
        }
    }
}

extension WatchRouteCue {
    /// "Turn left", or the route's own wording.
    var instruction: String { text ?? kind.title }

    /// "In 50 m, turn left" for the voice coach.
    func spoken(distanceMeters: Double, inMiles: Bool) -> String {
        let distance = WatchRunPlan.distance(max(10, (distanceMeters / 10).rounded() * 10), inMiles: inMiles)
        return String(localized: "watch.route.spoken", defaultValue: "In \(distance), \(instruction)")
    }
}
