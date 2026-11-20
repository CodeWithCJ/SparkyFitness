import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.Test;

(:test)
function snapshotStoreOnlyWipesForAnotherKnownAccount(logger as Logger) as Boolean {
    Test.assert(SnapshotStore.ownerChanged("server-a", "server-b"));
    Test.assert(!SnapshotStore.ownerChanged("server-a", "server-a"));
    Test.assert(!SnapshotStore.ownerChanged("", "server-b"));
    Test.assert(!SnapshotStore.ownerChanged("server-a", ""));
    Test.assert(!SnapshotStore.ownerChanged(null, "server-b"));
    Test.assert(!SnapshotStore.ownerChanged("server-a", null));
    return true;
}

(:test)
function snapshotStoreFormatsTheLocalDay(logger as Logger) as Boolean {
    Test.assertEqual("2026-01-05", SnapshotStore.dayString(2026, 1, 5));
    Test.assertEqual("2026-11-19", SnapshotStore.dayString(2026, 11, 19));
    var today = SnapshotStore.today();
    Test.assertEqual(10, today.length());
    Test.assertEqual("-", today.substring(4, 5));
    Test.assertEqual("-", today.substring(7, 8));
    return true;
}

// Fixtures, kept out of every build but the test build. Not tests
// themselves: the runner only runs functions marked (:test).
(:test)
module SnapshotFixtures {
    function snapshotMessage(owner as String, topics as Dictionary<String, Object>) as Dictionary<String, Object?> {
        return snapshotMessageAt(owner, topics, 1763550000000l);
    }

    function snapshotMessageAt(owner as String, topics as Dictionary<String, Object>, pushedAt as Long) as Dictionary<String, Object?> {
        return {
            "type" => "snapshot",
            "v" => 1,
            "pushedAt" => pushedAt,
            "today" => "2026-11-19",
            "owner" => owner,
            "topics" => topics
        } as Dictionary<String, Object?>;
    }

    function goalsTopic(remaining as Number) as Dictionary<String, Object> {
        return {
            "energyUnit" => "kcal",
            "day" => "2026-11-19",
            "consumed" => 100,
            "burned" => 0,
            "remaining" => remaining,
            "progress" => 0.05,
            "nutrients" => []
        } as Dictionary<String, Object>;
    }

    // The message as the phone sends it, with its send number and the
    // phone install that numbered it.
    function sent(message as Dictionary<String, Object?>, seq as Long) as Dictionary<String, Object?> {
        return sentFrom(message, seq, "phone-1");
    }

    function sentFrom(message as Dictionary<String, Object?>, seq as Long, origin as String) as Dictionary<String, Object?> {
        message.put("seq", seq);
        message.put("origin", origin);
        return message;
    }

    function accountCleared(seq as Long?) as Dictionary<String, Object?> {
        var message = {"type" => "accountCleared", "v" => 1} as Dictionary<String, Object?>;
        return seq != null ? sent(message, seq) : message;
    }

    // Empties the app's object store, `meta` included, which clearAll keeps.
    function reset() as Void {
        Storage.clearValues();
    }

    function storedRemaining() as Double? {
        var goals = SnapshotStore.readGoals();
        if (goals == null || goals.day == null) {
            return null;
        }
        return goals.remaining;
    }
}

// These use the simulator's object store, which a test run owns.
(:test)
function snapshotStoreStoresKnownTopicsAndMeta(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {
        "goals" => SnapshotFixtures.goalsTopic(1900),
        "someFutureTopic" => {"x" => 1}
    } as Dictionary<String, Object>));

    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    Test.assert(Storage.getValue("someFutureTopic") == null);
    var meta = Wire.dictionary(Storage.getValue(SnapshotStore.KEY_META) as Object?);
    Test.assert(meta != null);
    if (meta == null) {
        return false;
    }
    Test.assertEqual("server-a", meta.get("owner"));
    Test.assertEqual("2026-11-19", meta.get("today"));
    Test.assertEqual(1763550000000.0d, meta.get("pushedAt"));
    Test.assertEqual(1763550000000.0d, SnapshotStore.pushedAt());
    SnapshotFixtures.reset();
    return true;
}

// Only the changed topics come; one that is absent keeps what was stored.
(:test)
function snapshotStoreKeepsTopicsTheSnapshotLeavesOut(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>));
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {} as Dictionary<String, Object>));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());

    // A topic of the wrong type is ignored rather than stored.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => "broken"} as Dictionary<String, Object>));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}

(:test)
function snapshotStoreWipesTopicsWhenTheAccountChanges(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>));
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-b", {} as Dictionary<String, Object>));
    Test.assert(SnapshotStore.readGoals() == null);

    // The new account's own topics are stored after the wipe.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());

    // No account is not another account.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("", {} as Dictionary<String, Object>));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());
    SnapshotFixtures.reset();
    return true;
}

// Everything the phone sent goes; only the send number and its origin stay,
// with no owner.
(:test)
function snapshotStoreAccountClearedKeepsOnlyTheSeq(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    SnapshotStore.applySnapshot(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>), 5l));
    SnapshotStore.clearAll(SnapshotFixtures.accountCleared(6l));
    Test.assert(SnapshotStore.readGoals() == null);
    var meta = Wire.dictionary(Storage.getValue(SnapshotStore.KEY_META) as Object?);
    Test.assert(meta != null);
    if (meta == null) {
        return false;
    }
    Test.assertEqual(2, meta.size());
    Test.assert(SnapshotStore.pushedAt() == null);
    Test.assertEqual(6.0d, SnapshotStore.seq());

    // One without a number keeps the stored one.
    SnapshotStore.clearAll(SnapshotFixtures.accountCleared(null));
    Test.assertEqual(6.0d, SnapshotStore.seq());

    // Nothing stored and no number: nothing to keep.
    SnapshotFixtures.reset();
    SnapshotStore.clearAll(SnapshotFixtures.accountCleared(null));
    Test.assert(Storage.getValue(SnapshotStore.KEY_META) == null);
    return true;
}

// The stored number is the last applied message's (applySnapshot does not
// judge it; Inbound.apply does), or the stored one when it has none.
(:test)
function snapshotStoreSeqFollowsTheLastMessage(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var topics = {} as Dictionary<String, Object>;
    SnapshotStore.applySnapshot(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 10l));
    Test.assertEqual(10.0d, SnapshotStore.seq());
    SnapshotStore.applySnapshot(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 4l));
    Test.assertEqual(4.0d, SnapshotStore.seq());
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", topics));
    Test.assertEqual(4.0d, SnapshotStore.seq());
    SnapshotFixtures.reset();
    return true;
}

(:test)
function snapshotStoreKnowsALateMessage(logger as Logger) as Boolean {
    SnapshotFixtures.reset();
    var topics = {} as Dictionary<String, Object>;
    // Nothing stored yet: nothing is late.
    Test.assert(!SnapshotStore.isLate(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 1000l)));

    SnapshotStore.applySnapshot(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 1000000l));
    Test.assert(SnapshotStore.isLate(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 999999l)));
    // The same message again.
    Test.assert(SnapshotStore.isLate(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 1000000l)));
    // However late.
    Test.assert(SnapshotStore.isLate(SnapshotFixtures.accountCleared(1l)));
    Test.assert(!SnapshotStore.isLate(SnapshotFixtures.sent(SnapshotFixtures.snapshotMessage("server-a", topics), 1000001l)));
    // Another phone install numbers its own messages: never late.
    Test.assert(!SnapshotStore.isLate(SnapshotFixtures.sentFrom(SnapshotFixtures.snapshotMessage("server-a", topics), 5l, "phone-2")));

    // A message without a number is never held back.
    Test.assert(!SnapshotStore.isLate(SnapshotFixtures.snapshotMessage("server-a", topics)));
    Test.assert(!SnapshotStore.isLate(SnapshotFixtures.accountCleared(null)));
    SnapshotFixtures.reset();
    return true;
}
