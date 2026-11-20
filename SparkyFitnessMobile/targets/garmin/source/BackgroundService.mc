import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

// The background process. Connect IQ starts it when a phone message arrives
// (Background.registerForPhoneAppMessageEvent, registered by
// BackgroundRegistration from onAppInstall, onAppUpdate and Link.start), so
// the glance keeps up with the phone without the app being opened; a process
// that shows something redraws through AppBase.onStorageChanged.
//
// Other developers report that this event never fires on some watches (Venu 3,
// Forerunner 265) and fires with a null message on a fenix 8, so it is
// defensive and logs one line per event (GARMIN/APPS/LOGS/<APP>.TXT, see the
// README) for a test on a real watch. The open app never depends on it: Link
// still receives messages and asks for a fresh snapshot itself.
//
// Its process has 64 KB on the fenix 8, code included: everything it runs
// carries (:background), and the message is read in place (Inbound).
(:background)
class BackgroundService extends System.ServiceDelegate {
    function initialize() {
        ServiceDelegate.initialize();
    }

    function onPhoneAppMessage(msg as Communications.PhoneAppMessage) as Void {
        try {
            // Typed as never null, but a null message has been reported, so
            // it is read as an Object to keep the check. The test is on
            // Message, the class that declares `data`, so a watch that hands
            // over the base class still gets its data read.
            var received = msg as Object?;
            var data = received instanceof Communications.Message ? received.data : null;
            log(data == null ? "null message" : describe(Inbound.apply(data)));
        } catch (e instanceof Lang.Exception) {
            log("error " + e.getErrorMessage());
        }
        // Nothing goes to onBackgroundData: Storage is the hand-over. Exiting
        // at once frees the memory; the system would end the process after
        // 30 s anyway.
        Background.exit(null);
    }

    private function describe(result as Inbound.Result) as String {
        switch (result) {
            case Inbound.SNAPSHOT:
                return "snapshot applied";
            case Inbound.ACCOUNT_CLEARED:
                return "accountCleared";
            case Inbound.LATE_MESSAGE:
                return "late message dropped";
            case Inbound.UNKNOWN_TYPE:
                return "unknown type ignored";
            default:
                return "not a message";
        }
    }

    // One short line with the watch's time, so a log copied off the watch
    // can be matched with what was done on the phone.
    private function log(event as String) as Void {
        var time = System.getClockTime();
        System.println("bg " + time.hour.format("%02d") + ":" + time.min.format("%02d") + ":" + time.sec.format("%02d") + " " + event);
    }
}
