import Toybox.Lang;
import Toybox.WatchUi;

// Every nutrient the phone picked, for when the Goals page has more than it
// can show. A native Menu2, so it scrolls with the buttons and by touch and
// Back closes it, on any screen shape.
module NutrientList {
    // The list while it is on the view stack, shown or covered (a system
    // page, a notification), so a change in Storage can reach it (refresh).
    // A Menu2 keeps the text it was built with. Cleared when Back or sync
    // closes it.
    var _menu as NutrientMenu? = null;

    // Opens the list when today's goals have more nutrients than the page
    // shows. Returns whether it opened, so the input that asked is consumed
    // only then.
    function open() as Boolean {
        var rows = rowsToShow();
        if (rows == null) {
            return false;
        }
        var menu = new NutrientMenu(rows.size());
        for (var i = 0; i < rows.size(); i++) {
            menu.addItem(item(rows[i], i));
        }
        _menu = menu;
        WatchUi.pushView(menu, new NutrientListDelegate(), WatchUi.SLIDE_UP);
        return true;
    }

    // After Storage changed (a phone message, or the background service
    // wrote): the open list shows the new figures, so it never keeps figures
    // the watch no longer holds. With as many rows as before they are
    // updated in place, even while the list is covered; when today's goals
    // are gone or the number of rows changed (an account cleared, another
    // day, a different pick) it closes, at once when it is on top, else as
    // soon as it is shown again (NutrientMenu.onShow).
    function refresh() as Void {
        var menu = _menu;
        if (menu != null) {
            sync(menu, WatchUi.getCurrentView()[0] == menu);
        }
    }

    function sync(menu as NutrientMenu, onTop as Boolean) as Void {
        var rows = rowsToShow();
        if (rows == null || rows.size() != menu.count) {
            if (onTop) {
                _menu = null;
                WatchUi.popView(WatchUi.SLIDE_IMMEDIATE);
            } else {
                menu.stale = true;
            }
            return;
        }
        for (var i = 0; i < rows.size(); i++) {
            menu.updateItem(item(rows[i], i), i);
        }
        menu.stale = false;
        WatchUi.requestUpdate();
    }

    function closed() as Void {
        _menu = null;
    }

    // Today's nutrients when there are more than the page shows, else null.
    function rowsToShow() as Array<NutrientRow>? {
        var goals = SnapshotStore.readGoals();
        if (goals == null || !goals.isFor(SnapshotStore.today())) {
            return null;
        }
        var rows = goals.nutrients;
        return rows.size() > GoalsView.VISIBLE_ROWS ? rows : null;
    }

    function item(row as NutrientRow, index as Number) as WatchUi.MenuItem {
        return new WatchUi.MenuItem(row.label, Format.amountLine(row.consumed, row.goal, row.unit), index, null);
    }
}

class NutrientMenu extends WatchUi.Menu2 {
    // How many rows it was built with; refresh only updates them in place.
    var count as Number;
    // Storage changed while it was covered in a way it cannot show.
    var stale as Boolean;

    function initialize(count as Number) {
        Menu2.initialize({:title => Rez.Strings.NutrientsTitle});
        self.count = count;
        stale = false;
    }

    function onShow() as Void {
        Menu2.onShow();
        if (stale) {
            NutrientList.sync(self, true);
        }
    }
}

// Read-only: selecting a row does nothing, and Back closes the list.
class NutrientListDelegate extends WatchUi.Menu2InputDelegate {
    function initialize() {
        Menu2InputDelegate.initialize();
    }

    function onSelect(item as WatchUi.MenuItem) as Void {
    }

    // Overriding onBack drops Menu2's own pop, so it pops here.
    function onBack() as Void {
        NutrientList.closed();
        WatchUi.popView(WatchUi.SLIDE_DOWN);
    }
}
