import AppIntents
import SwiftUI
import WidgetKit

// Lock Screen and Control Center controls (iOS 18). Each is a button that runs
// one of the Siri and Shortcuts intents (ShortcutIntents.swift) without opening
// the app. They need the login the app keeps in the shared Keychain group the
// intents read, which it writes while a server is signed in.

@available(iOS 18.0, *)
struct LogWaterControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.logWater"

    // The value is read from the snapshot the Home Screen water widget reads;
    // iOS asks for it when the control is shown and again after the control's
    // own intent runs, so the total moves when a drink is logged.
    struct Provider: ControlValueProvider {
        var previewValue: WaterSnapshot {
            WaterSnapshot(consumedMl: 946, goalMl: 2840, drinkMl: 473, unit: "oz", canLog: true)
        }

        func currentValue() async throws -> WaterSnapshot {
            loadWaterSnapshot()
        }
    }

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: Provider()) { snapshot in
            // Tapping logs a drink; the label is today's total once the phone
            // has sent one.
            ControlWidgetButton(action: LogWaterIntent()) {
                Label(
                    snapshot.hasData ? snapshot.amountText : localizedWidgetString("widget.control.log_water.name"),
                    systemImage: "drop.fill"
                )
            }
        }
        .displayName("widget.control.log_water.name")
        .description("widget.control.log_water.description")
    }
}

@available(iOS 18.0, *)
struct StartFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.startFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StartFastIntent()) {
                Label("widget.control.start_fast.name", systemImage: "timer")
            }
        }
        .displayName("widget.control.start_fast.name")
        .description("widget.control.start_fast.description")
    }
}

@available(iOS 18.0, *)
struct EndFastControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.endFast"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: EndFastIntent()) {
                Label("widget.control.end_fast.name", systemImage: "stop.circle")
            }
        }
        .displayName("widget.control.end_fast.name")
        .description("widget.control.end_fast.description")
    }
}

// These two open the app on the screen they name through their own intents,
// which leaves the destination in the shared app group for the app to pick up.
// They are here so Control Center and the Lock Screen
// can hold the everyday ways in, not only the ones that log in the background.

@available(iOS 18.0, *)
struct ScanFoodControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.scanFood"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: ScanFoodControlIntent()) {
                Label("widget.control.scan_food.name", systemImage: "barcode.viewfinder")
            }
        }
        .displayName("widget.control.scan_food.name")
        .description("widget.control.scan_food.description")
    }
}

@available(iOS 18.0, *)
struct SearchFoodControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.searchFood"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: LogFoodControlIntent()) {
                Label("widget.control.search_food.name", systemImage: "magnifyingglass")
            }
        }
        .displayName("widget.control.search_food.name")
        .description("widget.control.search_food.description")
    }
}

/// Takes the last drink off today's total, for a mis-tap. The same request the
/// water widget's minus button makes.
@available(iOS 18.0, *)
struct RemoveWaterControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.removeWater"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: RemoveWaterIntent()) {
                Label("widget.control.remove_water.name", systemImage: "minus.circle")
            }
        }
        .displayName("widget.control.remove_water.name")
        .description("widget.control.remove_water.description")
    }
}

// Controls that show a number as well as doing something, so the Control Center
// tile reads like a small widget. The value comes from the same snapshots the
// Home Screen widgets read; iOS asks for it when the control is shown and again
// after the control's own intent runs.

@available(iOS 18.0, *)
struct CaloriesLeftControl: ControlWidget {
    static let kind = "com.sparkyapps.sparkyfitness.control.caloriesLeft"

    struct Provider: ControlValueProvider {
        var previewValue: CalorieSnapshot {
            CalorieSnapshot(food: 1540, burned: 255, goal: 3055, remaining: 1515, progress: 0.5, lastUpdated: nil)
        }

        func currentValue() async throws -> CalorieSnapshot {
            loadCalorieSnapshot()
        }
    }

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind, provider: Provider()) { snapshot in
            ControlWidgetButton(action: OpenDiaryControlIntent()) {
                Label(
                    snapshot.hasData
                        ? "\(localizedNumberString(snapshot.remaining)) \(localizedWidgetString("widget.kcal_left"))"
                        : localizedWidgetString("widget.calorie.name"),
                    systemImage: "flame.fill"
                )
            }
        }
        .displayName("widget.control.calories_left.name")
        .description("widget.control.calories_left.description")
    }
}
