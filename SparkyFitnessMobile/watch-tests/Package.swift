// swift-tools-version:5.9
import PackageDescription

// Runs the watch app's pure route logic (targets/watch/Domain/WatchRoute.swift,
// symlinked into Sources/) on a Mac, since the watch target has no test target
// of its own. Not part of the Xcode project or the pnpm workspace:
//
//   cd SparkyFitnessMobile/watch-tests && swift test
let package = Package(
    name: "WatchRouteTests",
    platforms: [.macOS(.v13)],
    targets: [
        .target(name: "WatchRoute"),
        .testTarget(name: "WatchRouteTests", dependencies: ["WatchRoute"]),
    ]
)
