import WidgetKit
import SwiftUI

@main
struct exportWatchWidgets: WidgetBundle {
    var body: some Widget {
        EnergyGoalComplication()
        CalorieGoalComplication()
        WaterGoalComplication()
        ProteinGoalComplication()
        CarbsGoalComplication()
        FatGoalComplication()
        FastingComplication()
        StepsComplication()
        CustomComplication()
    }
}
