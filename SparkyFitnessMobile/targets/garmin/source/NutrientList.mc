import Toybox.Lang;
import Toybox.WatchUi;

// Every nutrient the phone picked, for when the Goals page has more than it
// can show. A native Menu2, so it scrolls with the buttons and by touch and
// Back closes it, on any screen shape.
module NutrientList {
    // Opens the list when today's goals have more nutrients than the page
    // shows. Returns whether it opened, so the input that asked is consumed
    // only then.
    function open() as Boolean {
        var goals = SnapshotStore.readGoals();
        if (goals == null || !goals.isFor(SnapshotStore.today())) {
            return false;
        }
        var rows = goals.nutrients;
        if (rows.size() <= GoalsView.VISIBLE_ROWS) {
            return false;
        }

        var menu = new WatchUi.Menu2({:title => Rez.Strings.NutrientsTitle});
        for (var i = 0; i < rows.size(); i++) {
            var row = rows[i];
            menu.addItem(new WatchUi.MenuItem(row.label, Format.amountLine(row.consumed, row.goal, row.unit), i, null));
        }
        WatchUi.pushView(menu, new NutrientListDelegate(), WatchUi.SLIDE_UP);
        return true;
    }
}

// Read-only: selecting a row does nothing, and Back pops the list (Menu2's
// default).
class NutrientListDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
    }
}
