import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.Test;

// Inbound.apply is what both the open app and the background service run on
// each phone message. These use the simulator's object store.

(:test)
function inboundIgnoresWhatIsNotAMessage(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    Test.assertEqual(Inbound.NOT_A_MESSAGE, Inbound.apply(null));
    Test.assertEqual(Inbound.NOT_A_MESSAGE, Inbound.apply("snapshot"));
    Test.assertEqual(Inbound.NOT_A_MESSAGE, Inbound.apply({"v" => 1} as Dictionary<String, Object>));
    Test.assertEqual(Inbound.UNKNOWN_TYPE, Inbound.apply({"type" => "somethingNewer", "v" => 2} as Dictionary<String, Object>));
    Test.assert(Storage.getValue(SnapshotStore.KEY_META) == null);
    return true;
}

// Some watches may hand a message to both the open app and the background
// service: the second copy must leave Storage as the first one did.
(:test)
function inboundAppliesTheSameSnapshotTwiceHarmlessly(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var message = SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>);
    Test.assertEqual(Inbound.SNAPSHOT, Inbound.apply(message));
    Test.assertEqual(Inbound.SNAPSHOT, Inbound.apply(message));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    Test.assertEqual(1763550000000.0d, SnapshotStore.pushedAt());
    SnapshotFixtures.reset();
    return true;
}

// Either receiver drops a message already applied or sent before the last
// one applied (the background service starting late, or the open app's
// mailbox handing over what the service already applied); another phone
// install's numbers are its own.
(:test)
function inboundDropsALateMessage(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var newer = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>, 2000l), 20l);
    var older = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>, 1000l), 10l);
    Inbound.apply(newer);

    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(older));
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(newer));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());
    Test.assertEqual(2000.0d, SnapshotStore.pushedAt());

    var otherPhone = SnapshotFixtures.sentFrom(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>, 1000l), 10l, "phone-2");
    Test.assertEqual(Inbound.SNAPSHOT, Inbound.apply(otherPhone));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}

// Only the send order counts: a resend of an old snapshot (its old
// `pushedAt`, a new `seq`) is newer than what it follows, and a newer build
// sent earlier is older.
(:test)
function inboundOrdersBySendNotByBuildTime(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var resent = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>, 1000l), 30l);
    var earlier = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>, 5000l), 20l);
    Inbound.apply(resent);
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(earlier));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}

(:test)
function inboundAccountClearedDeletesTheFigures(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    Inbound.apply(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>), 1l));
    Test.assertEqual(Inbound.ACCOUNT_CLEARED, Inbound.apply(SnapshotFixtures.accountCleared(2l)));
    Test.assert(SnapshotStore.readGoals() == null);
    SnapshotFixtures.reset();
    return true;
}

// Both receivers: the open app takes the signed-out account's snapshot, the
// clear and the next account's first snapshot, then the background runs its
// late copies of all three. None of them changes what the open app stored,
// and the signed-out account's figures never come back.
(:test)
function inboundLateCopiesAroundASignInChangeNothing(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var before = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>, 1000l), 100l);
    var clear = SnapshotFixtures.accountCleared(101l);
    var after = SnapshotFixtures.sent(SnapshotFixtures.snapshotMessageAt("server-b", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>, 900l), 102l);
    Inbound.apply(before);
    Inbound.apply(clear);
    Inbound.apply(after);

    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(before));
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(clear));
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(after));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());

    // Signed out instead: the late copy of the last snapshot stays out.
    SnapshotFixtures.reset();
    Inbound.apply(before);
    Inbound.apply(clear);
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(before));
    Test.assert(SnapshotStore.readGoals() == null);
    SnapshotFixtures.reset();
    return true;
}

// The clear reached only the background (the app was closed) and ran late,
// after the wearer opened the app, which got the next account's figures.
(:test)
function inboundKeepsTheOpenAppsFiguresWhenOnlyTheClearIsLate(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    Inbound.apply(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-b", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>), 102l));
    Test.assertEqual(Inbound.LATE_MESSAGE, Inbound.apply(SnapshotFixtures.accountCleared(101l)));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}

// With the app closed the background gets everything in order.
(:test)
function inboundTheBackgroundAppliesMessagesInOrder(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    Inbound.apply(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>), 100l));
    Test.assertEqual(Inbound.ACCOUNT_CLEARED, Inbound.apply(SnapshotFixtures.accountCleared(101l)));
    Test.assert(SnapshotStore.readGoals() == null);
    Test.assertEqual(Inbound.SNAPSHOT, Inbound.apply(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-b", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>), 102l)));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}
