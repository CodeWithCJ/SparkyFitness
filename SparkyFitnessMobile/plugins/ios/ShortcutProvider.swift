import AppIntents

// Lists the Siri and Shortcuts actions in Spotlight, the Shortcuts app and the
// Action button, with the phrases Siri understands. App-target only: an
// AppShortcutsProvider is discovered from the app, while the intents themselves
// (targets/widget/ShortcutIntents.swift) are also compiled into the widget
// extension so Lock Screen and Control Center controls can run them.
@available(iOS 16.0, *)
struct SparkyFitnessShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogWaterIntent(),
            phrases: [
                "Log water in \(.applicationName)",
                "Add water to \(.applicationName)",
            ],
            shortTitle: "Log water",
            systemImageName: "drop.fill"
        )
        AppShortcut(
            intent: StartFastIntent(),
            phrases: ["Start a fast in \(.applicationName)"],
            shortTitle: "Start fast",
            systemImageName: "timer"
        )
        AppShortcut(
            intent: EndFastIntent(),
            phrases: ["End my fast in \(.applicationName)"],
            shortTitle: "End fast",
            systemImageName: "stop.circle"
        )
        AppShortcut(
            intent: LogWeightIntent(),
            phrases: ["Log my weight in \(.applicationName)"],
            shortTitle: "Log weight",
            systemImageName: "scalemass"
        )
    }
}
