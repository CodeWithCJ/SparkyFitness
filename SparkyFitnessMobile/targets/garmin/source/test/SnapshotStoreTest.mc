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
        return {
            "type" => "snapshot",
            "v" => 1,
            "pushedAt" => 1763550000000l,
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
    SnapshotStore.clearAll();
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
    SnapshotStore.clearAll();
    Test.assert(SnapshotStore.pushedAt() == null);
    return true;
}

// Only the changed topics come; one that is absent keeps what was stored.
(:test)
function snapshotStoreKeepsTopicsTheSnapshotLeavesOut(logger as Logger) as Boolean {
    SnapshotStore.clearAll();
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>));
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {} as Dictionary<String, Object>));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());

    // A topic of the wrong type is ignored rather than stored.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => "broken"} as Dictionary<String, Object>));
    Test.assertEqual(1900.0d, SnapshotFixtures.storedRemaining());
    SnapshotStore.clearAll();
    return true;
}

(:test)
function snapshotStoreWipesTopicsWhenTheAccountChanges(logger as Logger) as Boolean {
    SnapshotStore.clearAll();
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>));
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-b", {} as Dictionary<String, Object>));
    Test.assert(SnapshotStore.readGoals() == null);

    // The new account's own topics are stored after the wipe.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1500)} as Dictionary<String, Object>));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());

    // No account is not another account.
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("", {} as Dictionary<String, Object>));
    Test.assertEqual(1500.0d, SnapshotFixtures.storedRemaining());
    SnapshotStore.clearAll();
    return true;
}

(:test)
function snapshotStoreAccountClearedDeletesEverything(logger as Logger) as Boolean {
    SnapshotStore.applySnapshot(SnapshotFixtures.snapshotMessage("server-a", {"goals" => SnapshotFixtures.goalsTopic(1900)} as Dictionary<String, Object>));
    SnapshotStore.clearAll();
    Test.assert(SnapshotStore.readGoals() == null);
    Test.assert(Storage.getValue(SnapshotStore.KEY_META) == null);
    return true;
}
