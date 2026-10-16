import WidgetKit
import SwiftUI

@main
struct exportWidgets: WidgetBundle {
    var body: some Widget {
        widget()
        macroWidget()
        waterWidget()
        if #available(iOS 18.0, *) {
            LogWaterControl()
            RemoveWaterControl()
            CaloriesLeftControl()
            StartFastControl()
            EndFastControl()
            ScanFoodControl()
            SearchFoodControl()
        }
    }
}
