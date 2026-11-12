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
    /// The new workout view's picker: a segmented track set with the crown or a
    /// drag instead of a card that has to be selected first.
    var trackStyle = false
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

        private var band: EffortBand { EffortBand(score: Double(rating)) }

    var body: some View {
        if trackStyle { trackBody } else { cardBody }
    }

    private var trackBody: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if saved {
                Label(
                    String(localized: "watch.effort.saved", defaultValue: "Saved"),
                    systemImage: "checkmark"
                )
                .font(.headline)
                .foregroundStyle(.green)
            } else {
                Text("\(rating)")
                    .font(.system(size: WatchStyle.s(40), weight: .bold, design: .rounded))
                    .monospacedDigit()
                Text(band.name)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(band.color)
                EffortTrack(
                    values: Self.scores,
                    index: Binding(get: { rating - 1 }, set: { position = Double($0 + 1) }),
                    hapticsEnabled: checkIn.context.effectiveHapticsEnabled
                )
                Button(action: Haptics.tapping(saveRating)) {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.headline)
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.s(40))
                        .background(Color.white, in: WatchStyle.shape)
                        .contentShape(WatchStyle.shape)
                }
                .buttonStyle(.plain)
                .disabled(saving)
            }
        }
    }

    private static let scores: [Double] = (1...10).map(Double.init)

    private var cardBody: some View {
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
