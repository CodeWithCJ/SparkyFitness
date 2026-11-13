import SwiftUI

/// Gives the Digital Crown to a row that only becomes focusable once the
/// caller has selected something. A focus request made before that has
/// rendered is dropped, and a scroll view above the row then keeps the crown,
/// so the page scrolled instead of the value. Ask on the next run-loop turn,
/// then check twice more and re-ask from a cleared state while `stillWanted`
/// holds and the row is not the one holding focus.
func takeCrownFocus(_ focus: FocusState<Bool>.Binding, stillWanted: @escaping () -> Bool) {
    DispatchQueue.main.async { focus.wrappedValue = true }
    for delay in [0.15, 0.5] {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            guard stillWanted(), !focus.wrappedValue else { return }
            focus.wrappedValue = false
            DispatchQueue.main.async { focus.wrappedValue = true }
        }
    }
}
