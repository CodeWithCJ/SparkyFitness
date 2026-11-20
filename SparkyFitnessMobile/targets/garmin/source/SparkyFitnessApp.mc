import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// The glance and the background service run this same class, each in its
// own small process, so the class carries (:background) and (:glance).
// Everything only the full app needs is reached from getInitialView, which
// neither of them calls.
(:background :glance)
class SparkyFitnessApp extends Application.AppBase {
    // Set once this process shows a page or the glance. The background
    // process never does, and has no WatchUi to redraw with.
    private var _showing as Boolean;
    // Set once this process is the full app (pages, the nutrient list).
    private var _fullApp as Boolean;

    function initialize() {
        AppBase.initialize();
        _showing = false;
        _fullApp = false;
    }

    // onStart also runs for the glance and the background service, which must
    // not talk to the phone, so the link is started from getInitialView.
    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    // Only the full app gets here: register for phone messages (which also
    // delivers whatever waited in the mailbox) and ask for a fresh snapshot.
    // The registered callback holds the Link for the life of the app.
    (:typecheck([disableBackgroundCheck, disableGlanceCheck]))
    function getInitialView() as [Views] or [Views, InputDelegates] {
        _showing = true;
        _fullApp = true;
        new Link().start();

        var loop = new WatchUi.ViewLoop(new PageFactory(), {:page => 0, :wrap => false});
        return [loop, new WatchUi.ViewLoopDelegate(loop)];
    }

    (:typecheck(disableBackgroundCheck))
    function getGlanceView() as [GlanceView] or [GlanceView, GlanceViewDelegate] or Null {
        _showing = true;
        return [new GoalsGlanceView()];
    }

    // Only the background process asks for this; the glance never does.
    (:typecheck(disableGlanceCheck))
    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new BackgroundService()];
    }

    // Called in this process when another one (the background service, or
    // the app) wrote Storage. The pages and the glance read Storage on every
    // draw, so a redraw is all they need; the nutrient list's rows are
    // updated, or the list closed (NutrientList.refresh).
    (:typecheck([disableBackgroundCheck, disableGlanceCheck]))
    function onStorageChanged() as Void {
        if (_fullApp) {
            NutrientList.refresh();
        }
        if (_showing) {
            WatchUi.requestUpdate();
        }
    }
}
