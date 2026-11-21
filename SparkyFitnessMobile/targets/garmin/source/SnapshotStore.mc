import Toybox.Application;
import Toybox.Application.Storage;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.Time.Gregorian;

// Owns what the watch keeps from the phone: one Storage key per topic plus
// `meta`, and the rules for replacing them. The phone only sends a topic when
// it changed, so the last one stays here until the phone replaces or clears it.
// The background service writes here too (Inbound), so the module carries
// (:background) as well as (:glance).
(:background :glance)
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
    // Every phone message carries `seq`, which the phone raises with each
    // send, and `origin`, which names the phone install that numbered it;
    // `meta` keeps the last pair applied.
    const META_SEQ = "seq";
    const META_ORIGIN = "origin";

    // Only the pages and the glance read the goals; the background service
    // only writes, so Goals stays out of its 64 KB.
    (:typecheck(disableBackgroundCheck))
    function readGoals() as GoalsData? {
        return Goals.parse(readValue(KEY_GOALS));
    }

    // When the phone built the stored figures (epoch ms). Every snapshot
    // that is stored updates it (one with a topic that could not be stored
    // leaves it, and deletes that topic's older copy), and the phone leaves
    // out only topics that did not change, so it dates every stored topic.
    // Null before the first snapshot and after accountCleared.
    function pushedAt() as Double? {
        var meta = Wire.dictionary(readValue(KEY_META));
        return meta != null ? Wire.number(meta.get(META_PUSHED_AT)) : null;
    }

    // The `seq` of the last phone message applied, or null.
    function seq() as Double? {
        var meta = Wire.dictionary(readValue(KEY_META));
        return meta != null ? Wire.number(meta.get(META_SEQ)) : null;
    }

    // Whether a phone message is one the watch has already applied, or one
    // sent before that (Inbound.apply drops it): same `origin`, `seq` not
    // above the stored one. The phone's numbers only rise within an origin,
    // so a late copy (the background service starting after the open app
    // took newer messages, or the mailbox handing the open app what the
    // service already applied) is always caught, however late. Another
    // origin (a new install or another phone) is always applied, and so is
    // a message without the pair.
    function isLate(message as Dictionary<String, Object?>) as Boolean {
        var incoming = Wire.number(message.get(META_SEQ));
        var origin = Wire.string(message.get(META_ORIGIN));
        var meta = Wire.dictionary(readValue(KEY_META));
        if (incoming == null || origin == null || meta == null) {
            return false;
        }
        var stored = Wire.number(meta.get(META_SEQ));
        var storedOrigin = Wire.string(meta.get(META_ORIGIN));
        if (stored == null || storedOrigin == null || !origin.equals(storedOrigin)) {
            return false;
        }
        return incoming <= stored;
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

        // A topic not stored (object store full): the phone was told the
        // message arrived, so it sends that topic again only when it changes
        // or the watch asks (the app opening, a reconnect). Its older copy is
        // deleted, so the next envelope without topics cannot date it as new,
        // and `meta` is left as it was, so this message is not taken as
        // applied (isLate). The other topics are still written, so each one
        // the message carried is either current or gone.
        var failed = false;
        var topics = Wire.dictionary(message.get(MESSAGE_TOPICS));
        if (topics != null) {
            for (var i = 0; i < TOPICS.size(); i++) {
                var name = TOPICS[i];
                var topic = Wire.dictionary(topics.get(name));
                if (topic != null && !writeValue(name, topic as Dictionary<Storage.KeyType, Storage.ValueType>)) {
                    Storage.deleteValue(name);
                    failed = true;
                }
            }
        }
        if (failed) {
            return;
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
        putSeq(newMeta, message);
        writeValue(KEY_META, newMeta);
    }

    // `accountCleared`: the phone signed out, so nothing it sent may stay.
    // Only the message's `seq` and `origin` are kept, in a `meta` with no
    // owner, day or time (nothing draws a time without a topic, and no owner
    // is no account, see ownerChanged), so a late copy of the signed-out
    // account's snapshot is still dropped (isLate).
    function clearAll(message as Dictionary<String, Object?>) as Void {
        deleteTopics();
        var newMeta = {} as Dictionary<Storage.KeyType, Storage.ValueType>;
        putSeq(newMeta, message);
        if (newMeta.isEmpty()) {
            Storage.deleteValue(KEY_META);
        } else {
            writeValue(KEY_META, newMeta);
        }
    }

    // The message's `seq` and `origin` replace the stored pair (it was not
    // late, see isLate); a message without them keeps the stored pair.
    function putSeq(meta as Dictionary<Storage.KeyType, Storage.ValueType>, message as Dictionary<String, Object?>) as Void {
        var value = Wire.number(message.get(META_SEQ));
        var origin = Wire.string(message.get(META_ORIGIN));
        if (value == null || origin == null) {
            var stored = Wire.dictionary(readValue(KEY_META));
            if (stored == null) {
                return;
            }
            value = Wire.number(stored.get(META_SEQ));
            origin = Wire.string(stored.get(META_ORIGIN));
            if (value == null || origin == null) {
                return;
            }
        }
        meta.put(META_SEQ, value);
        meta.put(META_ORIGIN, origin);
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

    // A full object store must not crash the app; the caller decides what a
    // failed write means. Returns whether it was stored.
    function writeValue(key as String, value as Storage.ValueType) as Boolean {
        try {
            Storage.setValue(key, value);
            return true;
        } catch (e instanceof Lang.Exception) {
            System.println("SnapshotStore: could not store " + key + ": " + e.getErrorMessage());
            return false;
        }
    }
}
