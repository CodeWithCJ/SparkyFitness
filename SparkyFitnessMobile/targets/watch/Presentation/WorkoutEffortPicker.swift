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
    /// Skip hides the picker without rating the workout.
    @State private var skipped = false
    /// True while the write is in flight, so a second tap cannot send it twice.
    @State private var saving = false
    @FocusState private var crownFocused: Bool

    private var rating: Int { min(max(Int(position.rounded()), 1), 10) }

    private var title: String {
        String(localized: "watch.effort.title", defaultValue: "How hard was that?")
    }

    /// Apple Health's four bands: 1-3, 4-6, 7-8 and 9-10.
    private var band: EffortBand { EffortBand(score: Double(rating)) }

    var body: some View {
        if trackStyle { trackBody } else { cardBody }
    }

    private var trackBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(String(localized: "watch.effort.trackTitle", defaultValue: "How hard?"))
                .font(.system(size: WatchStyle.m(23), weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(height: WatchStyle.m(28))
                .accessibilityAddTraits(.isHeader)
            if saved {
                Label(
                    String(localized: "watch.effort.saved", defaultValue: "Saved"),
                    systemImage: "checkmark"
                )
                .font(.system(size: WatchStyle.m(21), weight: .semibold))
                .foregroundStyle(.green)
                .padding(.top, WatchStyle.m(12))
            } else if !skipped {
                HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(10)) {
                    Text("\(rating)")
                        .font(.system(size: WatchStyle.num(68), weight: .semibold))
                        .monospacedDigit()
                        .tracking(-WatchStyle.m(2))
                    Text(band.name)
                        .font(.system(size: WatchStyle.m(21), weight: .semibold))
                        .foregroundStyle(band.color)
                }
                .padding(.top, WatchStyle.m(12))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "watch.effort.value", defaultValue: "Effort \(rating) of 10, \(band.name)"))
                EffortTrack(
                    values: Self.scores,
                    index: Binding(get: { rating - 1 }, set: { position = Double($0 + 1) }),
                    hapticsEnabled: checkIn.context.effectiveHapticsEnabled
                )
                .padding(.top, WatchStyle.m(10))
                HStack(spacing: WatchStyle.m(6)) {
                    Button(action: Haptics.tapping { skipped = true }) {
                        Text(String(localized: "watch.rpe.skip", defaultValue: "Skip"))
                            .font(.system(size: WatchStyle.m(16), weight: .semibold))
                            .foregroundStyle(Color.white)
                            .frame(maxWidth: .infinity)
                            .frame(height: WatchStyle.m(46))
                            .background(WatchStyle.surface, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    Button(action: Haptics.tapping(saveRating)) {
                        Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                            .font(.system(size: WatchStyle.m(16), weight: .bold))
                            .foregroundStyle(Color.black)
                            .frame(maxWidth: .infinity)
                            .frame(height: WatchStyle.m(46))
                            .background(Color.white, in: Capsule())
                            .contentShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .disabled(saving)
                }
                .padding(.top, WatchStyle.m(10))
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
                PlainValueBox(
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
