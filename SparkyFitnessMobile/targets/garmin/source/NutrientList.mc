import Toybox.Lang;
import Toybox.Timer;
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
        var menu = new NutrientMenu(rows.size(), footerText());
        for (var i = 0; i < rows.size(); i++) {
            menu.addItem(item(rows[i], i));
        }
        _menu = menu;
        // A menu slides in from the right and back out to the right, as
        // Garmin's own apps do; up and down belong to the page loop.
        WatchUi.pushView(menu, new NutrientListDelegate(), WatchUi.SLIDE_LEFT);
        return true;
    }

    // After Storage changed (a phone message, or the background service
    // wrote): the open list shows the new figures, so it never keeps figures
    // the watch no longer holds. With as many rows as before they are
    // updated in place, even while the list is covered; when today's goals
    // are gone or the number of rows changed (an account cleared, another
    // day, a different pick) it closes, at once when it is on top, else as
    // soon as it is shown again (NutrientMenu.onShow checks it every time).
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
            }
            return;
        }
        for (var i = 0; i < rows.size(); i++) {
            menu.updateItem(item(rows[i], i), i);
        }
        menu.setFooter(footerText());
        WatchUi.requestUpdate();
    }

    function closed() as Void {
        _menu = null;
    }

    // "as of 9:12 AM" under the list, so its figures carry their time as the
    // page's do; null before any snapshot.
    function footerText() as String? {
        var pushedAt = SnapshotStore.pushedAt();
        if (pushedAt == null) {
            return null;
        }
        return Lang.format(WatchUi.loadResource(Rez.Strings.AsOf) as String, [SyncTime.text(pushedAt, true)]);
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
    // The longest the day timer waits at once; it then reads the clock again.
    private const MAX_TIMER_SECONDS = 60 * 60;

    // How many rows it was built with; refresh only updates them in place.
    var count as Number;
    // Wakes the list at local midnight while it is shown, when its rows stop
    // being today's; nothing else would close a list left open.
    private var _dayTimer as Timer.Timer;

    function initialize(count as Number, footer as String?) {
        if (footer != null) {
            Menu2.initialize({:title => Rez.Strings.NutrientsTitle, :footer => footer});
        } else {
            Menu2.initialize({:title => Rez.Strings.NutrientsTitle});
        }
        self.count = count;
        _dayTimer = new Timer.Timer();
    }

    // Checked whenever it is shown: Storage, or the day, may have changed
    // while it was covered.
    function onShow() as Void {
        Menu2.onShow();
        setDayTimer();
        NutrientList.sync(self, true);
    }

    function onHide() as Void {
        Menu2.onHide();
        _dayTimer.stop();
    }

    private function setDayTimer() as Void {
        _dayTimer.stop();
        var wait = SyncTime.secondsToMidnight();
        if (wait > MAX_TIMER_SECONDS) {
            wait = MAX_TIMER_SECONDS;
        }
        _dayTimer.start(method(:onDayTimer), wait * 1000, false);
    }

    // Through refresh, which acts only on the open list and checks what is
    // on top, so it never pops another view.
    function onDayTimer() as Void {
        setDayTimer();
        NutrientList.refresh();
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
        WatchUi.popView(WatchUi.SLIDE_RIGHT);
    }
}
