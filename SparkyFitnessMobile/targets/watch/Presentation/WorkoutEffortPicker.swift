import SwiftUI

/// "How hard was that?" for a finished workout: a 1-10 rating on the same
/// value card the set screen uses, with Apple Health's word for it underneath.
///
/// Like the set screen, the card has to be tapped before the Digital Crown
/// adjusts it. Until then the crown scrolls the summary, so reading down the
/// page never moves the number. Tap the card again to hand the crown back.
/// `save` runs the actual write and reports whether it worked; the picker only
/// tracks the choice and the saved state.
struct WorkoutEffortPicker: View {
    let save: (Int, @escaping (Bool) -> Void) -> Void

    @EnvironmentObject private var checkIn: CheckInStore

    /// The crown's position. A Double because that is what the crown binds to.
    /// Starts mid-scale so a quick tap on Save is a sensible answer.
    @State private var position: Double = 5
    @State private var selected = false
    @State private var saved = false
    /// True while the write is in flight, so a second tap cannot send it twice.
    @State private var saving = false
    @FocusState private var crownFocused: Bool

    private var rating: Int { min(max(Int(position.rounded()), 1), 10) }

    private var title: String {
        String(localized: "watch.effort.title", defaultValue: "How hard was that?")
    }

    /// Apple Health's four bands: 1-3, 4-6, 7-8 and 9-10.
    private var band: (name: String, color: Color) {
        switch rating {
        case ...3:
            return (String(localized: "watch.effort.band.easy", defaultValue: "Easy"), .green)
        case 4...6:
            return (String(localized: "watch.effort.band.moderate", defaultValue: "Moderate"), .yellow)
        case 7...8:
            return (String(localized: "watch.effort.band.hard", defaultValue: "Hard"), .orange)
        default:
            return (String(localized: "watch.effort.band.allOut", defaultValue: "All Out"), .red)
        }
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .watchFont(.footnote, classic: .caption)
                .foregroundStyle(.secondary)
            if saved {
                Label(
                    String(localized: "watch.effort.saved", defaultValue: "Saved"),
                    systemImage: "checkmark"
                )
                .watchFont(.headline, classic: .caption.weight(.semibold))
                .foregroundStyle(.green)
            } else {
                ValueBox(
                    value: "\(rating)",
                    unit: band.name,
                    isSelected: selected,
                    unitColor: band.color
                ) {
                    toggleSelected()
                }
                Text(
                    selected
                        ? String(localized: "watch.effort.hint.adjusting", defaultValue: "Turn the crown · tap to finish")
                        : String(localized: "watch.effort.hint.select", defaultValue: "Tap to change")
                )
                .watchFont(.footnote, classic: .system(size: 9))
                .foregroundStyle(.secondary)
                Button(action: Haptics.tapping(saveRating)) {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                }
                .disabled(saving)
            }
        }
        .padding(.top, 4)
        // Only the selected card owns the crown; otherwise it scrolls the page.
        .focusable(selected && !saved)
        .focused($crownFocused)
        .digitalCrownRotation(
            $position,
            from: 1,
            through: 10,
            by: 1,
            // Low, as on the set screen: at medium a small turn skipped several.
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: checkIn.context.effectiveHapticsEnabled
        )
    }

    private func toggleSelected() {
        if selected {
            deselect()
            return
        }
        selected = true
        // Next turn of the run loop: the view only becomes focusable once
        // `selected` is set, and focus asked for before that is dropped.
        DispatchQueue.main.async { crownFocused = true }
    }

    private func deselect() {
        selected = false
        crownFocused = false
    }

    private func saveRating() {
        guard !saving else { return }
        deselect()
        saving = true
        save(rating) { ok in
            saving = false
            saved = ok
        }
    }
}
