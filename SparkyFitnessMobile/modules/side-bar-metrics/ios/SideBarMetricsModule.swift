import ExpoModulesCore
import UIKit

// Where the system put the header's button column, and where the native Add
// button sits, both in screen points. A live activity grows the status cluster
// and pushes the column down, and iOS does not report that to the app, so the
// only way to know whether the date buttons still fit above the Add button is
// to read the laid-out views. Read-only: nothing here changes any view.
public class SideBarMetricsModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SideBarMetrics")

        AsyncFunction("measure") { () -> [String: Double]? in
            return SideBarMetricsModule.measureNow()
        }.runOnQueue(.main)
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
