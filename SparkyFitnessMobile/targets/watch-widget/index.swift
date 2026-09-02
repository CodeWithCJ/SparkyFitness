import WidgetKit
import SwiftUI

@main
struct exportWatchWidgets: WidgetBundle {
    var body: some Widget {
        EnergyGoalComplication()
        WaterGoalComplication()
    }
}
