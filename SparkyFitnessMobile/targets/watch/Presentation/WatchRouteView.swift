import SwiftUI
import MapKit

/// What the wearer needs from a followed route at a glance, shown under the
/// clock on the run's main page: the next turn and how far, or a red warning
/// when they have left the route.
struct RouteCueStrip: View {
    let progress: WatchRouteTracker.Snapshot?
    let usesMiles: Bool

    var body: some View {
        HStack(spacing: WatchStyle.s(6)) {
            Image(systemName: symbol)
                .font(.system(size: WatchStyle.s(15), weight: .bold))
            Text(label)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Spacer(minLength: 4)
            if let distance {
                Text(distance)
                    .monospacedDigit()
            }
        }
        .font(.system(size: WatchStyle.s(14), weight: .bold))
        .foregroundStyle(tint)
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(4))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: WatchStyle.s(10), style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private var isOff: Bool { progress?.isOffRoute == true }

    private var tint: Color { isOff ? .red : .cyan }

    private var symbol: String {
        if isOff { return "exclamationmark.triangle.fill" }
        guard let progress else { return "location.slash" }
        if progress.arrived { return WatchRouteCueKind.arrive.symbol }
        return progress.nextCue?.cue.kind.symbol ?? "arrow.up"
    }

    private var label: String {
        if isOff { return String(localized: "watch.route.offRoute", defaultValue: "Off route") }
        guard let progress else { return String(localized: "watch.route.waitingGps", defaultValue: "Waiting for GPS") }
        if progress.arrived { return WatchRouteCueKind.arrive.title }
        return progress.nextCue?.cue.instruction ?? WatchRouteCueKind.straight.title
    }

    private var distance: String? {
        guard let progress, !isOff, !progress.arrived, let next = progress.nextCue else { return nil }
        return WatchRunPlan.distance(next.distanceMeters, inMiles: usesMiles)
    }
}

/// The route page of a followed run: Apple Maps close around the wearer,
/// turned so the way ahead points up, with the route ahead in bold cyan and the
/// part already covered greyed out, a marker on the next turn, and the distance
/// left with the next instruction underneath. `WatchRouteOverviewPage` is the
/// whole route on one screen.
///
/// The map is a still picture (no panning or zooming, which would fight the
/// crown and the swipe between pages). With no signal the tiles stay blank, but
/// the route and the wearer are overlays MapKit draws itself, so the page is
/// still usable on a trail with no coverage.
///
/// The map is only built while its page is the one on screen (`isActive`):
/// a vertical-page `TabView` keeps its neighbours alive, and a map that keeps
/// loading tiles behind the live page would cost battery for nothing. It is
/// also left out while the screen is dimmed with the wrist down.
struct WatchRouteMapPage: View {
    var mode: RouteMapMode = .follow
    var isActive: Bool = true

    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var store: CheckInStore
    @Environment(\.isLuminanceReduced) private var dimmed

    private var usesMiles: Bool { store.context.distanceUnit == "miles" }

    var body: some View {
        if let route = run.route {
            Group {
                if isActive && !dimmed {
                    RouteMapLayer(
                        route: route,
                        progress: run.routeProgress,
                        position: run.routePosition,
                        mode: mode
                    )
                } else {
                    Color.black
                }
            }
            .overlay(alignment: .bottom) { footer }
            .overlay(alignment: .top) {
                if run.routeProgress?.isOffRoute == true {
                    Label(String(localized: "watch.route.offRoute", defaultValue: "Off route"), systemImage: "exclamationmark.triangle.fill")
                        .font(.system(size: WatchStyle.s(13), weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, WatchStyle.s(8))
                        .padding(.vertical, WatchStyle.s(3))
                        .background(Color.red, in: Capsule())
                        // Under the system clock, which sits over the top.
                        .padding(.top, WatchStyle.s(22))
                }
            }
        } else {
            Color.clear
        }
    }

    /// "3.42 km", in the phone's unit.
    private func remainingText(_ progress: WatchRouteTracker.Snapshot) -> String {
        let unit = usesMiles ? String(localized: "watch.unit.mi", defaultValue: "mi") : String(localized: "watch.unit.km", defaultValue: "km")
        return "\(WatchRunMetrics.distanceText(progress.remainingMeters, usesMiles: usesMiles)) \(unit)"
    }

    private var footer: some View {
        VStack(spacing: 0) {
            if let progress = run.routeProgress {
                Text(String(localized: "watch.route.left", defaultValue: "\(remainingText(progress)) left"))
                .font(.system(size: WatchStyle.s(15), weight: .bold, design: .rounded))
                .monospacedDigit()
                if !progress.isOffRoute, !progress.arrived, let next = progress.nextCue {
                    Label {
                        Text("\(next.cue.instruction) · \(WatchRunPlan.distance(next.distanceMeters, inMiles: usesMiles))")
                    } icon: {
                        Image(systemName: next.cue.kind.symbol)
                    }
                    .font(.system(size: WatchStyle.s(11), weight: .semibold))
                    .foregroundStyle(.cyan)
                }
            } else {
                Text(String(localized: "watch.route.waitingGps", defaultValue: "Waiting for GPS"))
                    .font(.system(size: WatchStyle.s(12), weight: .semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(2))
        .frame(maxWidth: .infinity)
        .background(.black.opacity(0.6))
    }
}

/// The whole route on one screen, the page after the followed map.
struct WatchRouteOverviewPage: View {
    var isActive: Bool = true

    var body: some View {
        WatchRouteMapPage(mode: .overview, isActive: isActive)
    }
}

enum RouteMapMode {
    /// Close around the wearer, heading up.
    case follow
    /// The whole route, north up.
    case overview
}

/// The map and what is drawn on it. MapKit places everything, so the route
/// lines up with the roads whatever shape the screen is.
private struct RouteMapLayer: View {
    let route: WatchRoute
    let progress: WatchRouteTracker.Snapshot?
    let position: WatchRoutePoint?
    let mode: RouteMapMode

    private let cumulative: [Double]

    /// The camera the map is showing. A new fix only replaces it when it has
    /// moved enough to see (`WatchRouteCamera.isWorthMoving`).
    @State private var shown: WatchRouteCamera?

    init(route: WatchRoute, progress: WatchRouteTracker.Snapshot?, position: WatchRoutePoint?, mode: RouteMapMode) {
        self.route = route
        self.progress = progress
        self.position = position
        self.mode = mode
        cumulative = WatchRouteTracker.cumulativeDistances(route.points)
    }

    var body: some View {
        // The point the wearer has reached; everything before it is done.
        let reached = progress.map { reachedIndex(progressMeters: $0.progressMeters) } ?? 0
        let done = route.points[0...reached].map(Self.coordinate)
        let ahead = route.points[reached...].map(Self.coordinate)
        let off = progress?.isOffRoute == true

        Map(position: .constant(mapPosition), interactionModes: []) {
            if done.count > 1 {
                MapPolyline(coordinates: done).stroke(.gray.opacity(0.8), lineWidth: 5)
            }
            if ahead.count > 1 {
                // A white edge under the cyan keeps the line readable over
                // parks, water and busy streets.
                MapPolyline(coordinates: ahead).stroke(.white, lineWidth: 10)
                MapPolyline(coordinates: ahead).stroke(.cyan, lineWidth: 6)
            }

            // Start and finish.
            if let first = route.points.first, let last = route.points.last {
                Annotation("", coordinate: Self.coordinate(first), anchor: .center) {
                    Self.dot(.green, size: 10)
                }
                Annotation("", coordinate: Self.coordinate(last), anchor: .center) {
                    Self.dot(.white, size: 10)
                }
            }

            // The next turn.
            if let next = progress?.nextCue, next.cue.kind != .depart {
                let index = min(next.cue.index, route.points.count - 1)
                Annotation("", coordinate: Self.coordinate(route.points[index]), anchor: .center) {
                    Image(systemName: next.cue.kind.symbol)
                        .font(.system(size: 11, weight: .heavy))
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(Color.orange))
                        .overlay(Circle().stroke(Color.white, lineWidth: 2))
                }
            }

            // The wearer.
            if let position {
                Annotation("", coordinate: Self.coordinate(position), anchor: .center) {
                    Circle()
                        .fill(off ? Color.red : Color.blue)
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(Color.white, lineWidth: 3))
                }
            }
        }
        // Points of interest are clutter at this size and each is a label MapKit
        // has to lay out.
        .mapStyle(.standard(emphasis: .muted, pointsOfInterest: .excludingAll))
        // The compass badge MapKit adds once the map turns sits on the page dots.
        .mapControlVisibility(.hidden)
        .onChange(of: position) { _, _ in refreshCamera() }
        .onChange(of: progress) { _, _ in refreshCamera() }
        .onAppear { refreshCamera() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(route.name)
    }

    private var targetCamera: WatchRouteCamera? {
        guard mode == .follow, let position else { return nil }
        return WatchRouteCamera.follow(route: route, cumulative: cumulative, progress: progress, position: position)
    }

    private func refreshCamera() {
        guard let next = targetCamera, next.isWorthMoving(from: shown) else { return }
        shown = next
    }

    private var mapPosition: MapCameraPosition {
        guard mode == .follow else { return .region(overviewRegion) }
        // Before the first fix there is nothing to follow; show the route.
        guard let camera = shown ?? targetCamera else { return .region(overviewRegion) }
        return .camera(MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: camera.lat, longitude: camera.lon),
            distance: camera.distance,
            heading: camera.heading,
            pitch: 0
        ))
    }

    /// The whole route, with a margin for the clock above and the footer below;
    /// the wearer too while off the route, so the dot stays on the screen.
    private var overviewRegion: MKCoordinateRegion {
        let extra = progress?.isOffRoute == true ? position : nil
        let area = WatchRouteCamera.overview(points: route.points, extra: extra)
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: area.centerLat, longitude: area.centerLon),
            span: MKCoordinateSpan(latitudeDelta: area.latSpan, longitudeDelta: area.lonSpan)
        )
    }

    /// The last point at or before `progressMeters` along the line.
    private func reachedIndex(progressMeters: Double) -> Int {
        var low = 0
        var high = cumulative.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if cumulative[mid] <= progressMeters { low = mid } else { high = mid - 1 }
        }
        return low
    }

    private static func coordinate(_ point: WatchRoutePoint) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: point.lat, longitude: point.lon)
    }

    private static func dot(_ color: Color, size: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Color.black.opacity(0.5), lineWidth: 1.5))
    }
}
