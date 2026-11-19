import Toybox.Lang;
import Toybox.System;
import Toybox.Test;
import Toybox.Time;
import Toybox.Time.Gregorian;

(:test)
function formatClockFollowsTheWatchClock(logger as Logger) as Boolean {
    Test.assertEqual("09:12", Format.clock(9, 12, true));
    Test.assertEqual("21:05", Format.clock(21, 5, true));
    Test.assertEqual("00:00", Format.clock(0, 0, true));
    Test.assertEqual("9:12", Format.clock(9, 12, false));
    // Midnight and noon are 12 on a 12-hour clock, never 0.
    Test.assertEqual("12:05", Format.clock(0, 5, false));
    Test.assertEqual("12:30", Format.clock(12, 30, false));
    Test.assertEqual("11:59", Format.clock(23, 59, false));
    return true;
}

(:test)
function syncTimeReadsEpochMilliseconds(logger as Logger) as Boolean {
    Test.assertEqual(1763550000, SyncTime.moment(1763550000000.0d).value());
    // Part of a second is dropped, not rounded up into the next minute.
    Test.assertEqual(1763550000, SyncTime.moment(1763550000999.0d).value());
    return true;
}

(:test)
function syncTimeIsStaleAfterFifteenMinutes(logger as Logger) as Boolean {
    var pushedAt = 1763550000000.0d;
    Test.assert(!SyncTime.isStale(pushedAt, 1763550000));
    Test.assert(!SyncTime.isStale(pushedAt, 1763550000 + 15 * 60));
    Test.assert(SyncTime.isStale(pushedAt, 1763550000 + 15 * 60 + 1));
    Test.assert(SyncTime.isStale(pushedAt, 1763550000 + 8 * 60 * 60));
    // A phone clock ahead of the watch's is not a stale snapshot.
    Test.assert(!SyncTime.isStale(pushedAt, 1763550000 - 60 * 60));
    return true;
}

// The page's timer wakes it at staleAt, so that has to be the very second
// isStale turns true, part seconds included.
(:test)
function syncTimeStaleAtIsTheFirstStaleSecond(logger as Logger) as Boolean {
    Test.assertEqual(1763550000 + 15 * 60 + 1, SyncTime.staleAt(1763550000000.0d));
    var pushedAts = [1763550000000.0d, 1763550000001.0d, 1763550000999.0d] as Array<Double>;
    for (var i = 0; i < pushedAts.size(); i++) {
        var at = SyncTime.staleAt(pushedAts[i]);
        Test.assert(SyncTime.isStale(pushedAts[i], at));
        Test.assert(!SyncTime.isStale(pushedAts[i], at - 1));
    }
    return true;
}

// The text is the local time of that instant: the zone is the simulator's,
// so the expected digits come from the same conversion.
(:test)
function syncTimeShowsTheLocalTime(logger as Logger) as Boolean {
    var pushedAt = 1763550000000.0d;
    var info = Gregorian.info(new Time.Moment(1763550000), Time.FORMAT_SHORT);
    var is24Hour = System.getDeviceSettings().is24Hour;
    var digits = Format.clock(info.hour, info.min, is24Hour);
    var text = SyncTime.text(pushedAt, true);
    Test.assertEqual(0, text.find(digits));
    if (!is24Hour) {
        Test.assert(text.find(info.hour < 12 ? "AM" : "PM") != null);
    }
    // The short form is the digits alone, on either clock.
    Test.assertEqual(digits, SyncTime.text(pushedAt, false));
    return true;
}
