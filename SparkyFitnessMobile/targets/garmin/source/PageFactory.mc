import Toybox.Lang;
import Toybox.WatchUi;

// The app's pages in swipe order, served to the ViewLoop. Goals is the only
// page so far; a new page adds itself to PAGES and to getView.
class PageFactory extends WatchUi.ViewLoopFactory {
    enum Page {
        PAGE_GOALS
    }

    private const PAGES = [PAGE_GOALS] as Array<Page>;

    function initialize() {
        ViewLoopFactory.initialize();
    }

    function getSize() as Number {
        return PAGES.size();
    }

    function getView(page as Number) as [ViewLoopFactory.Views] or [ViewLoopFactory.Views, ViewLoopFactory.Delegates] {
        switch (PAGES[page]) {
            case PAGE_GOALS:
            default:
                return [new GoalsView(), new GoalsDelegate()];
        }
    }
}
