import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.WatchUi;

// The protocol's message types and version (agent-docs/garmin.md). A receiver
// ignores types and keys it does not know, so a newer phone stays readable.
module Protocol {
    const VERSION = 1;

    const KEY_TYPE = "type";
    const KEY_VERSION = "v";

    // Phone to watch.
    const TYPE_SNAPSHOT = "snapshot";
    const TYPE_ACCOUNT_CLEARED = "accountCleared";

    // Watch to phone.
    const TYPE_REQUEST_CONTEXT = "requestContext";
}

typedef OutboundMessage as Dictionary<Communications.TransmitKeyType, Communications.TransmitType>;

// The watch's side of the Connect IQ mailbox. Phone messages are handed over
// one call each, including any that waited while the app was closed; sends go
// out one at a time, because the next transmit should not start before the
// previous one has reported back.
class Link {
    // Nothing the watch sends today is worth holding a long line for: the
    // phone resends everything when the watch connects or asks.
    private const MAX_QUEUED = 4;

    private var _queue as Array<OutboundMessage>;
    private var _sending as Boolean;

    function initialize() {
        _queue = [] as Array<OutboundMessage>;
        _sending = false;
    }

    // Registering also delivers whatever waited in the mailbox; then the
    // phone is asked for a fresh snapshot, since it cannot know the app
    // opened.
    function start() as Void {
        Communications.registerForPhoneAppMessages(method(:onPhoneMessage));
        requestContext();
    }

    // One request waiting in the line is enough: the phone answers each one
    // with its whole snapshot.
    function requestContext() as Void {
        for (var i = 0; i < _queue.size(); i++) {
            var queuedType = _queue[i].get(Protocol.KEY_TYPE);
            if (queuedType instanceof Lang.String && queuedType.equals(Protocol.TYPE_REQUEST_CONTEXT)) {
                return;
            }
        }
        send({
            Protocol.KEY_TYPE => Protocol.TYPE_REQUEST_CONTEXT,
            Protocol.KEY_VERSION => Protocol.VERSION
        } as OutboundMessage);
    }

    // `v` is not checked: unknown types and keys are ignored instead, so a
    // newer phone's snapshot still fills in everything this watch knows.
    function onPhoneMessage(msg as Communications.PhoneAppMessage) as Void {
        var message = Wire.dictionary(msg.data);
        if (message == null) {
            return;
        }
        var type = Wire.string(message.get(Protocol.KEY_TYPE));
        if (type == null) {
            return;
        }
        if (type.equals(Protocol.TYPE_SNAPSHOT)) {
            SnapshotStore.applySnapshot(message);
        } else if (type.equals(Protocol.TYPE_ACCOUNT_CLEARED)) {
            SnapshotStore.clearAll();
        } else {
            return;
        }
        WatchUi.requestUpdate();
    }

    private function send(message as OutboundMessage) as Void {
        if (_queue.size() >= MAX_QUEUED) {
            System.println("Link: send queue full, dropping a message");
            return;
        }
        _queue.add(message);
        transmitNext();
    }

    private function transmitNext() as Void {
        if (_sending || _queue.size() == 0) {
            return;
        }
        _sending = true;
        Communications.transmit(_queue[0], null, new LinkListener(method(:onTransmitDone)));
    }

    // A failed message is dropped, not retried: there is no outbox yet, and
    // the phone resends the snapshot when the watch reconnects anyway.
    function onTransmitDone(delivered as Boolean) as Void {
        if (!delivered) {
            System.println("Link: transmit failed");
        }
        _queue = _queue.slice(1, null) as Array<OutboundMessage>;
        _sending = false;
        transmitNext();
    }
}

// Reports one transmit's outcome back to the Link.
class LinkListener extends Communications.ConnectionListener {
    private var _done as Method(delivered as Boolean) as Void;

    function initialize(done as Method(delivered as Boolean) as Void) {
        ConnectionListener.initialize();
        _done = done;
    }

    function onComplete() as Void {
        _done.invoke(true);
    }

    function onError() as Void {
        _done.invoke(false);
    }
}
