import Toybox.Background;
import Toybox.Lang;
import Toybox.System;

// Lets the background service (BackgroundService.mc) take phone messages
// while the app is closed, so the glance keeps up. The registration outlives
// the app. It is made when the app is installed or updated (onAppInstall,
// onAppUpdate, which the system runs in the background and does not
// guarantee) and again each time the app opens (Link.start), which costs
// nothing and puts it back if the system ever dropped it. Some watches lack
// the event, and a failure here never stops anything else.
(:background)
module BackgroundRegistration {
    function register() as Void {
        if (!(Background has :registerForPhoneAppMessageEvent)) {
            System.println("No background phone messages on this watch");
            return;
        }
        try {
            Background.registerForPhoneAppMessageEvent();
        } catch (e instanceof Lang.Exception) {
            System.println("Background registration failed: " + e.getErrorMessage());
        }
    }
}
