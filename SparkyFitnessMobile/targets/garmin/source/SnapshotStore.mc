import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;

// Owns what the watch keeps from the phone: one Storage key per topic plus
// `meta`, and the rules for replacing them. The phone only sends a topic when
// it changed, so the last one stays here until the phone replaces or clears it.
(:glance)
module SnapshotStore {
    const KEY_META = "meta";
    const KEY_GOALS = "goals";

    // Every topic the watch knows, each stored under the key of the same
    // name. A topic the phone sends that is not listed here is ignored.
    const TOPICS = [KEY_GOALS] as Array<String>;

    // Keys of a `snapshot` message; `meta` keeps the first three.
    const META_PUSHED_AT = "pushedAt";
    const META_TODAY = "today";
    const META_OWNER = "owner";
    const MESSAGE_TOPICS = "topics";

    function readGoals() as GoalsData? {
        return Goals.parse(readValue(KEY_GOALS));
    }

    // When the phone built the stored figures (epoch ms). Every snapshot
    // updates it, and the phone leaves out only topics that did not change,
    // so it dates every stored topic. Null before the first snapshot.
    function pushedAt() as Double? {
        var meta = Wire.dictionary(readValue(KEY_META));
        return meta != null ? Wire.number(meta.get(META_PUSHED_AT)) : null;
    }

    // A `snapshot` message: replaces each known topic it carries, after
    // wiping every topic when it comes from another account.
    function applySnapshot(message as Dictionary<String, Object?>) as Void {
        var owner = Wire.string(message.get(META_OWNER));
        if (owner == null) {
            owner = "";
        }

        var storedOwner = null;
        var meta = Wire.dictionary(readValue(KEY_META));
        if (meta != null) {
            storedOwner = Wire.string(meta.get(META_OWNER));
        }
        if (ownerChanged(storedOwner, owner)) {
            deleteTopics();
        }

        var topics = Wire.dictionary(message.get(MESSAGE_TOPICS));
        if (topics != null) {
            for (var i = 0; i < TOPICS.size(); i++) {
                var name = TOPICS[i];
                var topic = Wire.dictionary(topics.get(name));
                if (topic != null) {
                    writeValue(name, topic as Dictionary<Storage.KeyType, Storage.ValueType>);
                }
            }
        }

        var newMeta = {META_OWNER => owner} as Dictionary<Storage.KeyType, Storage.ValueType>;
        var pushedAt = Wire.number(message.get(META_PUSHED_AT));
        if (pushedAt != null) {
            newMeta.put(META_PUSHED_AT, pushedAt);
        }
        var today = Wire.string(message.get(META_TODAY));
        if (today != null) {
            newMeta.put(META_TODAY, today);
        }
        writeValue(KEY_META, newMeta);
    }

    // `accountCleared`: the phone signed out, so nothing it sent may stay.
    function clearAll() as Void {
        deleteTopics();
        Storage.deleteValue(KEY_META);
    }

    function deleteTopics() as Void {
        for (var i = 0; i < TOPICS.size(); i++) {
            Storage.deleteValue(TOPICS[i]);
        }
    }

    // Only a change from one known account to another wipes: an empty owner
    // (no account, or nothing stored yet) is not a different account.
    function ownerChanged(stored as String?, incoming as String?) as Boolean {
        if (stored == null || incoming == null) {
            return false;
        }
        if (stored.length() == 0 || incoming.length() == 0) {
            return false;
        }
        return !stored.equals(incoming);
    }

    // The watch's own local date as YYYY-MM-DD, the form the phone sends.
    function today() as String {
        var info = Gregorian.info(Time.now(), Time.FORMAT_SHORT);
        var month = info.month;
        if (month instanceof Lang.Number) {
            return dayString(info.year, month, info.day);
        }
        // FORMAT_SHORT always gives a numeric month; if a firmware ever does
        // not, no stored day matches and the pages show their not-synced state.
        return "";
    }

    function dayString(year as Number, month as Number, day as Number) as String {
        return year.format("%04d") + "-" + month.format("%02d") + "-" + day.format("%02d");
    }

    function readValue(key as String) as Object? {
        return Storage.getValue(key) as Object?;
    }

    // A full object store must not crash the app over a snapshot the phone
    // will send again.
    function writeValue(key as String, value as Storage.ValueType) as Void {
        try {
            Storage.setValue(key, value);
        } catch (e instanceof Lang.Exception) {
            System.println("SnapshotStore: could not store " + key + ": " + e.getErrorMessage());
        }
    }
}
