import Toybox.Lang;

// Applies one phone message to Storage. Both receivers go through here, the
// open app's Link and the background service, so a message means the same
// thing whichever process gets it, and the second copy of one (some watches
// may hand a message to both) is dropped (see apply).
//
// The background process runs this with 64 KB on the fenix 8, code included,
// so it reads the message in place, never copies it, and reaches only
// SnapshotStore, Wire and the protocol constants.
(:background)
module Inbound {
    enum Result {
        // Nothing to read: null data (reported on a fenix 8), not a
        // dictionary, or no type.
        NOT_A_MESSAGE,
        // A type this watch does not know; a newer phone may send one.
        UNKNOWN_TYPE,
        SNAPSHOT,
        ACCOUNT_CLEARED,
        // A snapshot or accountCleared already applied, or sent before the
        // last one applied, left alone (see apply).
        LATE_MESSAGE
    }

    // `v` is not checked: unknown types and keys are ignored instead, so a
    // newer phone's snapshot still fills in everything this watch knows.
    //
    // A message already applied, or sent before the last one applied, is
    // dropped (SnapshotStore.isLate), by the phone's send number, whichever
    // receiver gets it. The background service can start late, after the
    // open app took the same message and newer ones (when the watch gives a
    // message to both), or took the next ones itself (a message reaches only
    // the background while the app is closed); and the open app's mailbox
    // can hand it what the service already applied. Applying such a message
    // would bring back replaced figures (a signed-out account's included) or
    // empty the watch of the next account's, and the phone does not resend a
    // topic it thinks the watch has. A resend gets a new number, so it is
    // newer than what it follows even though it keeps its old `pushedAt`.
    function apply(data as Object?) as Result {
        var message = Wire.dictionary(data);
        if (message == null) {
            return NOT_A_MESSAGE;
        }
        var type = Wire.string(message.get(Protocol.KEY_TYPE));
        if (type == null) {
            return NOT_A_MESSAGE;
        }
        var snapshot = type.equals(Protocol.TYPE_SNAPSHOT);
        if (!snapshot && !type.equals(Protocol.TYPE_ACCOUNT_CLEARED)) {
            return UNKNOWN_TYPE;
        }
        if (SnapshotStore.isLate(message)) {
            return LATE_MESSAGE;
        }
        if (snapshot) {
            SnapshotStore.applySnapshot(message);
            return SNAPSHOT;
        }
        SnapshotStore.clearAll(message);
        return ACCOUNT_CLEARED;
    }
}
