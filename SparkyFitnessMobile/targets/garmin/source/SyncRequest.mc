import Toybox.Lang;
import Toybox.System;

// When the open app last asked the phone for today's numbers
// (Link.requestContext), so the Goals page can say it is waiting rather than
// tell the wearer to open the phone app before the phone had a chance to
// answer.
module SyncRequest {
    // How long an answer is waited for before the page says what to do.
    const WAIT_MS = 15000;

    var _requestedAt as Number? = null;

    function markRequested() as Void {
        _requestedAt = System.getTimer();
    }

    // The phone answered (a snapshot or a clear), or the request could not
    // be sent: nothing more is coming for it.
    function clear() as Void {
        _requestedAt = null;
    }

    // Milliseconds left to wait for the answer, or 0 when not waiting.
    function waitLeftMs() as Number {
        var at = _requestedAt;
        if (at == null) {
            return 0;
        }
        var left = WAIT_MS - (System.getTimer() - at);
        return left > 0 ? left : 0;
    }
}
