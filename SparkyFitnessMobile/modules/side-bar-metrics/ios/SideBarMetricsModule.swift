import ExpoModulesCore
import UIKit

// Where the system put the header's button column, and where the native Add
// button sits, both in screen points. A live activity grows the status cluster
// and pushes the column down, and iOS does not report that to the app, so the
// only way to know whether the date buttons still fit above the Add button is
// to read the laid-out views. Read-only: nothing here changes any view.
public class SideBarMetricsModule: Module {
    private let watcher = OcclusionWatcher()

    public func definition() -> ModuleDefinition {
        Name("SideBarMetrics")

        // iOS reports no event when a Live Activity starts or ends, and
        // UIKit's reserved-region query has no change notification either, so
        // the only way to react at once is to ask every frame. That is done
        // here, natively, where one query per frame is cheap, and JS hears only
        // about actual changes. Reference counted: several screens may watch.
        Events("onOcclusionChange")


        Function("startWatching") { () -> Void in
            DispatchQueue.main.async {
                self.watcher.start { [weak self] payload in
                    self?.sendEvent("onOcclusionChange", payload)
                }
            }
        }

        Function("stopWatching") { () -> Void in
            DispatchQueue.main.async { self.watcher.stop() }
        }

        AsyncFunction("measure") { () -> [String: Double]? in
            return SideBarMetricsModule.measureNow()
        }.runOnQueue(.main)

        // Which edge the system puts its vertical bar on right now: "leading",
        // "trailing" or "none"; "unsupported" on an OS without vertical bars and
        // "unknown" when the trait cannot be read yet. Side safe-area insets alone
        // are not an answer: a notched iPhone in landscape has them too.
        AsyncFunction("verticalBarEdge") { () -> String in
            return SideBarMetricsModule.verticalBarEdgeNow()
        }.runOnQueue(.main)

        // The regions the system reserves for its own status content (clock,
        // Wi-Fi cluster, and any Live Activity stacked into it), as window-space
        // rects. This is UIKit's own answer to "what is in my way", so a running
        // activity is counted without guessing. `null` when the OS has no such
        // query (before iOS 27.1) or no window is up yet.
        // The date buttons are native bar items that the system swaps with no
        // animation when their set changes. Call this just before the swap: it
        // freezes the header column's current look as an overlay and fades it
        // out while the new column fades in, so the change reads as one
        // dissolve instead of a pop.
        Function("crossfadeHeaderColumn") { (duration: Double) in
            DispatchQueue.main.async {
                SideBarMetricsModule.crossfadeColumn(duration: duration)
            }
        }

        AsyncFunction("occlusionRegions") { () -> [[String: Double]]? in
            return SideBarMetricsModule.occlusionRegionsNow()
        }.runOnQueue(.main)
    }

    /// `UIView.reservedRegions(kind: .occlusion)` on the app window (iOS 27.1).
    /// Guarded on the compiler as well as the OS so a toolchain without the
    /// symbol still builds; the caller treats `nil` as "could not measure".
    static func occlusionRegionsNow() -> [[String: Double]]? {
        #if compiler(>=6.4)
        if #available(iOS 27.1, *) {
            let windows = visibleWindows()
            guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else {
                return nil
            }
            return window.reservedRegions(kind: .occlusion).map { region in
                [
                    "x": Double(region.frame.minX),
                    "y": Double(region.frame.minY),
                    "width": Double(region.frame.width),
                    "height": Double(region.frame.height),
                ]
            }
        }
        #endif
        return nil
    }








    /// `UITraitCollection.verticalBarEdge` (iOS 27.1). Read through key-value
    /// coding so this compiles against any SDK. A system without the trait
    /// answers "unsupported": it has no vertical bars, so the layout stays
    /// horizontal. "unknown" means the trait exists but could not be read yet.
    static func verticalBarEdgeNow() -> String {
        let windows = visibleWindows()
        guard let window = windows.first(where: { $0.isKeyWindow }) ?? windows.first else {
            return "unknown"
        }
        let traits = window.traitCollection
        guard traits.responds(to: NSSelectorFromString("verticalBarEdge")) else {
            return "unsupported"
        }
        guard let raw = traits.value(forKey: "verticalBarEdge") as? Int else {
            return "unknown"
        }
        // UIVerticalBarEdge: unspecified = 0, leading = 1, trailing = 2.
        switch raw {
        case 1: return "leading"
        case 2: return "trailing"
        default: return "none"
        }
    }

    /// Size of the window the regions are read from; changes on fold or rotation.
    static func primaryWindowSize() -> CGSize {
        let windows = visibleWindows()
        return (windows.first(where: { $0.isKeyWindow }) ?? windows.first)?.bounds.size ?? .zero
    }

    /// Every window on screen. The app's own window is not always the key
    /// window (an alert or a system sheet can hold that), so look in all of them.
    private static func visibleWindows() -> [UIWindow] {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .filter { !$0.isHidden && $0.alpha > 0.01 }
    }

    private static func name(_ v: UIView) -> String { NSStringFromClass(type(of: v)) }

    private static func containsBarButton(_ v: UIView) -> Bool {
        if name(v).contains("_UIButtonBarButton") { return true }
        return v.subviews.contains { containsBarButton($0) }
    }

    static func headerColumnNow() -> (view: UIView, window: UIWindow)? { headerColumn() }

    /// The narrow glass group holding the header's bar buttons, with its window.
    private static func headerColumn() -> (view: UIView, window: UIWindow)? {
        var found: (UIView, UIWindow)?
        func walk(_ v: UIView, in window: UIWindow) {
            if found != nil || v.isHidden || v.alpha < 0.01 { return }
            if name(v).contains("PlatformGlassInteractionView") {
                let f = v.convert(v.bounds, to: window)
                if f.width < 90, f.height > 0, containsBarButton(v) {
                    found = (v, window)
                    return
                }
            }
            v.subviews.forEach { walk($0, in: window) }
        }
        visibleWindows().forEach { walk($0, in: $0) }
        return found
    }

    /// Cover the header column with a picture of how it looks now, wait for the
    /// system to swap in the new items underneath, then fade the picture away
    /// so the new column is revealed. The new column is never touched: a fade
    /// applied to it can only start after it already exists, which is a pop.
    /// The picture spans the larger of the old and the full-group height so a
    /// column that grows is covered too. Purely cosmetic; with no column on
    /// screen it does nothing.
    /// The column hidden ahead of a swap, until its replacement has arrived.
    private static weak var hiddenColumn: UIView?
    private static var hiddenToken = 0
    private static var hiddenHeight: CGFloat = 0
    /// A picture of the strip as it was just before the jump, covering whatever
    /// the system draws there until the replacement column is in place.
    private static var coverOverlay: UIView?

    /// True while a fold or rotation is still settling (set by the watcher).
    static var poseSettling = false

    /// A picture of `frame` (window space) as the window shows it right now.
    static func snapshotImage(window: UIWindow, frame: CGRect) -> UIImage {
        let renderer = UIGraphicsImageRenderer(bounds: CGRect(origin: .zero, size: frame.size))
        return renderer.image { _ in
            window.drawHierarchy(
                in: CGRect(x: -frame.minX, y: -frame.minY, width: window.bounds.width, height: window.bounds.height),
                afterScreenUpdates: false)
        }
    }

    /// The system just moved the column (a live activity pushed it down, or
    /// took it away) and that is being applied in the current layout pass, so
    /// nothing has been drawn at the new place yet. Hide the column before it
    /// is, and show a picture of it at its old place instead, fading out. The
    /// replacement fades in later (`crossfadeColumn`). Called from a layout
    /// pass, so it must not wait for anything.
    static func interceptJump(column: UIView, window: UIWindow, old: (image: UIImage, frame: CGRect)?) {
        guard hiddenColumn == nil, coverOverlay == nil else { return }
        hiddenColumn = column
        hiddenHeight = column.bounds.height
        hiddenToken += 1
        let token = hiddenToken
        if let old {
            // Cover the whole strip, down past where the column is pushed to,
            // with how it looked a moment ago. What the system draws under it
            // (the column at its new place, its glass, anything) stays hidden
            // until the replacement is ready and the picture dissolves away.
            let overlay = UIImageView(image: old.image)
            overlay.frame = old.frame
            overlay.isUserInteractionEnabled = false
            window.addSubview(overlay)
            coverOverlay = overlay
        } else {
            column.alpha = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            guard hiddenToken == token, hiddenColumn != nil else { return }
            hiddenColumn = nil
            if let overlay = coverOverlay {
                coverOverlay = nil
                UIView.animate(
                    withDuration: 0.25, animations: { overlay.alpha = 0 },
                    completion: { _ in overlay.removeFromSuperview() })
            } else {
                UIView.animate(withDuration: 0.25) { column.alpha = 1 }
            }
        }
    }

    /// Drop a cover that was put up for a move that turned out to be a fold or
    /// rotation: put the column back and take the picture away at once.
    static func abortCover() {
        guard hiddenColumn != nil || coverOverlay != nil else { return }
        hiddenToken += 1
        let column = hiddenColumn
        hiddenColumn = nil
        if let overlay = coverOverlay {
            coverOverlay = nil
            overlay.removeFromSuperview()
        }
        column?.alpha = 1
    }

    /// Height of the three-button date group plus the gap kept above the Add
    /// button. Mirrors `DATE_COLUMN_EXPANDED_HEIGHT` + `DATE_COLUMN_MIN_GAP`.
    static let fullGroupClearance: CGFloat = 152 + 8

    /// Whether the full date group clears the Add button, from the same two
    /// numbers the JS side uses: the bottom of the status strip (UIKit's
    /// reserved regions) and the top of the Add button. `nil` if unknown.
    static func groupFits(regions: [[String: Double]]?, metrics: [String: Double]?) -> Bool? {
        guard let regions, let addTop = metrics?["addTop"] else { return nil }
        let strip = regions.filter {
            ($0["width"] ?? 0) > 0 && ($0["width"] ?? 0) <= 140
                && ($0["height"] ?? 0) > 0 && ($0["y"] ?? 0) < 240
        }
        guard let bottom = strip.map({ ($0["y"] ?? 0) + ($0["height"] ?? 0) }).max() else { return nil }
        return CGFloat(bottom) + fullGroupClearance <= CGFloat(addTop)
    }

    /// Get the old column out of the way at once. The activity moves the column
    /// the instant it starts, but the JS side only swaps the items a round trip
    /// later, so for that long the old buttons sit on the Add button. This
    /// fades them out natively in the same frame the change is seen; the
    /// replacement then fades in when it arrives (`crossfadeColumn`). If no
    /// replacement comes (JS decided otherwise) the column is brought back.
    static func hideColumnNow(duration: Double = 0.1) {
        guard hiddenColumn == nil else { return }
        guard let (column, _) = headerColumn() else { return }
        hiddenColumn = column
        hiddenHeight = column.bounds.height
        hiddenToken += 1
        let token = hiddenToken
        UIView.animate(withDuration: duration, delay: 0, options: [.curveEaseIn, .allowUserInteraction]) {
            column.alpha = 0
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            guard hiddenToken == token, let column = hiddenColumn else { return }
            hiddenColumn = nil
            UIView.animate(withDuration: 0.25) { column.alpha = 1 }
        }
    }

    /// Reveal the replacement column of a swap that `hideColumnNow` prepared.
    private static func revealReplacement(duration: Double) {
        let hidden = hiddenColumn
        let token = hiddenToken
        var ticks = 0
        func watch() {
            ticks += 1
            // The header may build a new column view or resize the one it has
            // (hidden, so the search skips it): either way that is the swap.
            let fresh = headerColumn()?.view
                ?? ((hidden?.window != nil && abs((hidden?.bounds.height ?? 0) - hiddenHeight) > 1) ? hidden : nil)
            if let fresh, fresh !== hidden || abs(fresh.bounds.height - hiddenHeight) > 1 {
                hiddenColumn = nil
                if let (c, w) = headerColumn() { ColumnMotionGuard.shared.attach(c, w) }
                if let overlay = coverOverlay {
                    // The replacement is already in place under the picture:
                    // dissolve the picture away to reveal it.
                    coverOverlay = nil
                    UIView.animate(
                        withDuration: duration, delay: 0, options: [.curveEaseInOut, .allowUserInteraction],
                        animations: { overlay.alpha = 0 },
                        completion: { _ in overlay.removeFromSuperview() })
                } else {
                    fresh.alpha = 0
                    UIView.animate(
                        withDuration: duration, delay: 0, options: [.curveEaseOut, .allowUserInteraction],
                        animations: { fresh.alpha = 1 },
                        completion: { _ in fresh.alpha = 1 })
                }
            } else if ticks > 60 || hiddenToken != token {
                // No replacement: leave things as they were.
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { watch() }
            }
        }
        watch()
    }

    static func crossfadeColumn(duration: Double) {
        // A fold or rotation changes the answer too, but the column is then still
        // on its way to its new place: a picture of it taken now would show
        // whatever content is under its old spot, pasted where the buttons go
        // (a rectangle of the card text, seen on a device after folding). The new
        // answer is applied without a dissolve in that case.
        if poseSettling {
            abortCover()
            return
        }
        if hiddenColumn != nil {
            revealReplacement(duration: duration)
            return
        }
        guard let (column, window) = headerColumn() else { return }
        let windowSize = window.bounds.size
        let before = column.convert(column.bounds, to: window)
        // Room for the full three-button group (152) plus the glass margin.
        let frame = CGRect(
            x: before.minX - 12, y: before.minY - 12,
            width: before.width + 24, height: max(before.height, 152) + 24)
        let renderer = UIGraphicsImageRenderer(bounds: CGRect(origin: .zero, size: frame.size))
        let image = renderer.image { _ in
            window.drawHierarchy(
                in: CGRect(x: -frame.minX, y: -frame.minY, width: window.bounds.width, height: window.bounds.height),
                afterScreenUpdates: false)
        }
        let overlay = UIImageView(image: image)
        overlay.frame = frame
        overlay.isUserInteractionEnabled = false
        window.addSubview(overlay)

        func reveal() {
            UIView.animate(
                withDuration: duration, delay: 0, options: [.curveEaseInOut, .allowUserInteraction],
                animations: { overlay.alpha = 0 },
                completion: { _ in overlay.removeFromSuperview() })
        }
        // Poll each frame for the swap (a different column view or height); the
        // update is applied on the main queue a little after JS asks for it.
        var ticks = 0
        func watch() {
            ticks += 1
            if poseSettling || window.bounds.size != windowSize {
                overlay.removeFromSuperview()
                return
            }
            let now = headerColumn()
            let changed = now == nil || now!.view !== column
                || abs(now!.view.convert(now!.view.bounds, to: now!.window).height - before.height) > 1
            if changed {
                // Let the new column render once underneath before revealing it.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { reveal() }
            } else if ticks > 40 {
                reveal()
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.016) { watch() }
            }
        }
        watch()
    }

    /// Ask every visible view to lay out again, and do it now.
    static func relayoutAll() {
        func mark(_ v: UIView) {
            v.setNeedsLayout()
            v.subviews.forEach(mark)
        }
        for window in visibleWindows() {
            mark(window)
            window.layoutIfNeeded()
        }
    }

    static func measureNow() -> [String: Double]? {
        let windows = visibleWindows()
        if windows.isEmpty { return nil }
        var columnTop: CGFloat?
        var columnHeight: CGFloat?
        var addTop: CGFloat?

        func walk(_ v: UIView, in window: UIWindow) {
            // A hidden or transparent ancestor hides the whole subtree: other
            // tabs and pushed-over screens keep their views alive.
            if v.isHidden || v.alpha < 0.01 { return }
            let n = name(v)
            if n.contains("SideAddHost") {
                if let glass = v.subviews.first(where: { $0 is UIVisualEffectView && !$0.isHidden }) {
                    addTop = glass.convert(glass.bounds, to: window).minY
                }
                return
            }
            // A narrow glass group holding bar buttons is the header's column.
            if n.contains("PlatformGlassInteractionView") {
                let f = v.convert(v.bounds, to: window)
                if f.width < 90, f.height > 0, containsBarButton(v) {
                    if columnTop == nil || f.minY < columnTop! {
                        columnTop = f.minY
                        columnHeight = f.height
                    }
                    return
                }
            }
            v.subviews.forEach { walk($0, in: window) }
        }
        windows.forEach { walk($0, in: $0) }

        var out: [String: Double] = [:]
        if let columnTop { out["columnTop"] = Double(columnTop) }
        if let columnHeight { out["columnHeight"] = Double(columnHeight) }
        if let addTop { out["addTop"] = Double(addTop) }
        return out.isEmpty ? nil : out
    }
}


/// Runs a display link while at least one JS listener is watching. Each frame
/// it reads the status regions (cheap) and emits when they or the window size
/// change. The header measurements walk the view tree, so they are taken only
/// when the regions changed, and for a short settle window after the window
/// resizes (a fold or rotation moves the Add button a moment later, with no
/// region change to announce it).
final class OcclusionWatcher: NSObject {
    private var link: CADisplayLink?
    private var watchers = 0
    private var emit: (([String: Any]) -> Void)?
    private var lastRegions: [[String: Double]]?
    private var lastSize: CGSize = .zero
    private var lastPayload: NSDictionary?
    private var settleUntil: CFTimeInterval = 0
    /// After a pose change the tab bar keeps moving for a while (the Add button
    /// passes through several heights before it lands), and nothing tells the
    /// app when it has. Keep reading, a few times a second, until the readings
    /// have held still for a moment.
    private var measureUntil: CFTimeInterval = 0
    private var lastLateMeasure: CFTimeInterval = 0
    private var nudgeAt: CFTimeInterval = 0
    private var earlyNudges: [CFTimeInterval] = []
    private var wasSettling = false
    private var lastFits: Bool?
    private var lastAttachCheck: CFTimeInterval = 0

    func start(_ emit: @escaping ([String: Any]) -> Void) {
        self.emit = emit
        watchers += 1
        guard link == nil else {
            // A new listener wants the current state right away.
            lastPayload = nil
            return
        }
        lastRegions = nil
        lastSize = .zero
        lastPayload = nil
        let link = CADisplayLink(target: self, selector: #selector(tick))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        link.add(to: .main, forMode: .common)
        self.link = link
    }

    func stop() {
        watchers = max(0, watchers - 1)
        guard watchers == 0 else { return }
        link?.invalidate()
        link = nil
        emit = nil
    }

    @objc private func tick() {
        let regions = SideBarMetricsModule.occlusionRegionsNow()
        let size = SideBarMetricsModule.primaryWindowSize()
        let now = CACurrentMediaTime()
        let regionsChanged = !Self.same(regions, lastRegions)
        if size != lastSize {
            lastSize = size
            settleUntil = now + 1.5
            measureUntil = now + 4
            // Do not wait for the pose to settle: lay out again early and a few
            // times, so a missed layout is repaired within a couple of frames.
            earlyNudges = [0.08, 0.2, 0.4, 0.7, 1.1].map { now + $0 }
            // A new pose has its own answer; do not compare across poses.
            lastFits = nil
            SideBarMetricsModule.abortCover()
        }
        SideBarMetricsModule.poseSettling = now < settleUntil
        // The system tab bar sometimes does not finish its last layout after a
        // fold and leaves the Add button at a transitional height (seen on a
        // device: stuck 60 pt too high for good). Once the fold has settled, ask
        // the whole tree to lay out once more; that costs nothing when it is
        // already right.
        if wasSettling, !SideBarMetricsModule.poseSettling { nudgeAt = now + 0.15 }
        wasSettling = SideBarMetricsModule.poseSettling
        if let next = earlyNudges.first, now >= next {
            earlyNudges.removeFirst()
            if nudgeAt == 0 { nudgeAt = now }
        }
        if nudgeAt > 0, now >= nudgeAt {
            nudgeAt = 0
            SideBarMetricsModule.relayoutAll()
            measureUntil = max(measureUntil, now + 1)
        }
        // Keep the motion guard on the column that is on screen. The header
        // column is replaced when a header swaps its items or a screen comes
        // back, and a guard left on a dead view sees nothing; waiting for the
        // next status change to re-attach is one change too late, because that
        // change is the very jump it has to catch.
        //
        // Knowing whether the guard still has a live column is a pointer check,
        // done every frame. Only when it has lost its column is the view tree
        // walked to find the new one, and that walk is rationed to a few times a
        // second.
        if !ColumnMotionGuard.shared.isOnLiveColumn, now - lastAttachCheck > 0.25 {
            lastAttachCheck = now
            if let (column, window) = SideBarMetricsModule.headerColumnNow() {
                ColumnMotionGuard.shared.attach(column, window)
            }
        }
        let lateMeasure = now >= settleUntil && now < measureUntil && now - lastLateMeasure > 0.1
        if lateMeasure { lastLateMeasure = now }
        guard regionsChanged || now < settleUntil || lateMeasure || lastPayload == nil else { return }
        lastRegions = regions
        let metrics = SideBarMetricsModule.measureNow()
        if let (column, window) = SideBarMetricsModule.headerColumnNow() {
            ColumnMotionGuard.shared.attach(column, window)
        }
        // In a settled pose, a change in whether the full group fits is a live
        // activity starting or ending: start clearing the old column now.
        // While the pose is still settling the answer is only recorded.
        if let fits = SideBarMetricsModule.groupFits(regions: regions, metrics: metrics) {
            if now >= settleUntil, let before = lastFits, before != fits {
                SideBarMetricsModule.hideColumnNow()
            }
            lastFits = fits
        }
        let payload: [String: Any] = [
            "regions": regions.map { $0 as Any } ?? NSNull(),
            "metrics": metrics.map { $0 as Any } ?? NSNull(),
            // The window these were read in, so a listener can tell a reading
            // of its own pose from one taken mid-rotation or mid-fold.
            "windowWidth": Double(size.width),
            "windowHeight": Double(size.height),
        ]
        let snapshot = payload as NSDictionary
        if let last = lastPayload, last.isEqual(snapshot) { return }
        lastPayload = snapshot
        // Something moved: keep watching until it has held still for a while.
        measureUntil = max(measureUntil, now + 0.6)
        emit?(payload)
    }

    private static func same(_ a: [[String: Double]]?, _ b: [[String: Double]]?) -> Bool {
        switch (a, b) {
        case (nil, nil): return true
        case let (a?, b?): return (a as NSArray).isEqual(b as NSArray)
        default: return false
        }
    }
}


/// Sees the header column move while the layout pass that moves it is still
/// running. A display link only runs after that pass has been drawn, which is
/// one frame with the old buttons sitting on the Add button. Key-value
/// observing the column's layer chain is synchronous with the change, so the
/// column can be swapped for a picture of its old self before anything is
/// drawn. `prior` notifications arrive before the change, which is when the
/// picture is taken.
final class ColumnMotionGuard {
    static let shared = ColumnMotionGuard()

    private var observations: [NSKeyValueObservation] = []
    private weak var column: UIView?
    private weak var window: UIWindow?
    private var baseline: CGRect = .zero
    private var baselineSize: CGSize = .zero
    private var pending: (image: UIImage, frame: CGRect, at: CFTimeInterval)?

    /// A move smaller than this is not a live activity.
    private let jumpThreshold: CGFloat = 12


    /// Whether the guard is watching a column that is still on screen.
    var isOnLiveColumn: Bool {
        guard let column else { return false }
        return column.window != nil && column.superview != nil
    }

    func attach(_ column: UIView, _ window: UIWindow) {
        if self.column === column { return }
        observations.removeAll()
        pending = nil
        self.column = column
        self.window = window
        baseline = column.convert(column.bounds, to: window)
        baselineSize = window.bounds.size
        var view: UIView? = column
        while let v = view {
            let layer = v.layer
            observations.append(layer.observe(\.position, options: [.prior, .new]) { [weak self] _, change in
                self?.changed(prior: change.isPrior)
            })
            observations.append(layer.observe(\.bounds, options: [.prior, .new]) { [weak self] _, change in
                self?.changed(prior: change.isPrior)
            })
            observations.append(layer.observe(\.transform, options: [.prior, .new]) { [weak self] _, change in
                self?.changed(prior: change.isPrior)
            })
            view = v.superview
        }
    }

    private var lastSnapshotAt: CFTimeInterval = 0

    private func changed(prior: Bool) {
        guard let column, let window, column.window === window else { return }
        let now = CACurrentMediaTime()
        if prior {
            // A fold or rotation changes the column hundreds of times in a few
            // hundred milliseconds. Taking a picture for each (about 8 ms apiece)
            // stalled the main thread for most of a second, so only take one when
            // the pose is steady, where an activity could be about to move it.
            // The flip starts before the window has changed size, so also never
            // take more than a few pictures a second: an activity needs only the
            // one taken just before it moves the column.
            if window.bounds.size != baselineSize || SideBarMetricsModule.poseSettling
                || now - lastSnapshotAt < 0.25 { return }
            // Take the picture before the first change of this pass.
            if pending == nil || now - pending!.at > 0.05 {
                lastSnapshotAt = now
                var frame = column.convert(column.bounds, to: window).insetBy(dx: -12, dy: -12)
                // Extend downwards: the activity pushes the column down by up
                // to about this much, and all of it has to be covered.
                frame.size.height += 140
                guard frame.width > 0, frame.height > 0, frame.height < 700 else { return }
                pending = (SideBarMetricsModule.snapshotImage(window: window, frame: frame), frame, now)
            }
            return
        }
        let frame = column.convert(column.bounds, to: window)
        // A fold or rotation moves everything, sideways or by resizing the
        // window; an activity only moves the column down or up in place.
        if window.bounds.size != baselineSize || SideBarMetricsModule.poseSettling
            || abs(frame.minX - baseline.minX) > 3 {
            baselineSize = window.bounds.size
            baseline = frame
            pending = nil
            SideBarMetricsModule.abortCover()
            return
        }
        if abs(frame.minY - baseline.minY) > jumpThreshold {
            let origin = baseline
            let originSize = baselineSize
            let old = pending.map { (image: $0.image, frame: $0.frame) }
            pending = nil
            baseline = frame
            SideBarMetricsModule.interceptJump(column: column, window: window, old: old)
            // This is judged in the middle of a layout, where UIKit sets a
            // layer's position and its bounds as separate steps: between the two
            // the column briefly looks displaced by half its height (seen on a
            // device on every fold and rotation: the top flipping 24 / -117 within
            // milliseconds). So confirm once the layout has settled, and take the
            // cover down if the column is back where it was or the pose changed.
            DispatchQueue.main.async { [weak self] in
                guard let self, let column = self.column, let window = self.window else { return }
                let final = column.convert(column.bounds, to: window)
                let samePose = window.bounds.size == originSize && abs(final.minX - origin.minX) <= 3
                let moved = abs(final.minY - origin.minY) > self.jumpThreshold
                if !samePose || !moved {
                    self.baseline = final
                    self.baselineSize = window.bounds.size
                    SideBarMetricsModule.abortCover()
                }
            }
        } else {
            baseline = frame
        }
    }
}


