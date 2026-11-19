import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

// The glance runs this same class in its own small process, so the class
// carries (:glance). Everything only the full app needs is reached from
// getInitialView, which the glance never calls.
(:glance)
class SparkyFitnessApp extends Application.AppBase {
    function initialize() {
        AppBase.initialize();
    }

    // onStart also runs for the glance, which must not talk to the phone, so
    // the link is started from getInitialView instead.
    function onStart(state as Dictionary?) as Void {
    }

    function onStop(state as Dictionary?) as Void {
    }

    // Only the full app gets here: register for phone messages (which also
    // delivers whatever waited in the mailbox) and ask for a fresh snapshot.
    // The registered callback holds the Link for the life of the app.
    (:typecheck(disableGlanceCheck))
    function getInitialView() as [Views] or [Views, InputDelegates] {
        new Link().start();

        var loop = new WatchUi.ViewLoop(new PageFactory(), {:page => 0, :wrap => false});
        return [loop, new WatchUi.ViewLoopDelegate(loop)];
    }

    function getGlanceView() as [GlanceView] or [GlanceView, GlanceViewDelegate] or Null {
        return [new GoalsGlanceView()];
    }
}
