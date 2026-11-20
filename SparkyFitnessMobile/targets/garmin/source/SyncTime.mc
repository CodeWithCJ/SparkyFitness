import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;
import Toybox.WatchUi;

// When the stored figures are from. The phone stamps every snapshot with
// `pushedAt` (epoch ms), and the watch has to show it: snapshots reach
// Storage from the full app and, where the watch delivers phone messages to
// it, from the background service (BackgroundService.mc), and nothing
// guarantees either ran recently. So the glance, or a page whose phone app
// has gone away, can be showing figures from hours ago that would otherwise
// pass for live ones.
(:glance)
module SyncTime {
    // The Goals page says "as of" once its figures are older than this. The
    // glance shows the time always, as nothing guarantees it was refreshed
    // recently.
    const STALE_AFTER_SECONDS = 15 * 60;

    // Epoch ms (how the phone sends times) to the watch's seconds.
    function moment(epochMs as Double) as Moment {
        return new Time.Moment((epochMs / 1000.0d).toNumber());
    }

    // The first whole second (watch time) at which figures stamped `epochMs`
    // count as old: more than STALE_AFTER_SECONDS have passed.
    function staleAt(epochMs as Double) as Number {
        return Math.floor(epochMs / 1000.0d + STALE_AFTER_SECONDS).toNumber() + 1;
    }

    // A phone clock running ahead of the watch's gives a negative age, which
    // counts as fresh rather than as a date in the future.
    function isStale(epochMs as Double, nowSeconds as Number) as Boolean {
        return nowSeconds >= staleAt(epochMs);
    }

    // `epochMs` as a local time on the watch's 12 or 24 hour clock. Without
    // `withPeriod` a 12-hour time leaves out AM or PM, for a line that has no
    // room for them; only ever with a label such as "as of", so the time is
    // never taken for the current one.
    function text(epochMs as Double, withPeriod as Boolean) as String {
        var info = Gregorian.info(moment(epochMs), Time.FORMAT_SHORT);
        var hour = info.hour;
        var is24Hour = System.getDeviceSettings().is24Hour;
        var digits = Format.clock(hour, info.min, is24Hour);
        if (is24Hour || !withPeriod) {
            return digits;
        }
        var pattern = WatchUi.loadResource(hour < 12 ? Rez.Strings.TimeAm : Rez.Strings.TimePm) as String;
        return Lang.format(pattern, [digits]);
    }
}
