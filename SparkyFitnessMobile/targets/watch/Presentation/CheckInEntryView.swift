import SwiftUI
import WatchKit

/// The morning check-in screen: one screen, both numbers, Digital Crown for all
/// precision work.
///
/// The crown owns precision because it is the only input on this device that
/// works on a barely-awake human with damp fingers — no aiming required, and it
/// is unaffected by water. Taps only ever mean "next" and "save", and are
/// full-width so they can be hit without looking.
struct CheckInEntryView: View {
    enum Field { case weight, bodyFat }

    /// Kg-denominated constants, converted to the display unit below. Kept in
    /// kg so the underlying feel (how many real-world grams a detent is, how
    /// wide the dial window is) stays constant regardless of which unit is
    /// showing — only the numbers on screen change.
    private static let weightWindowKg = 6.0
    private static let bodyFatWindow = 5.0
    private static let weightAlertPerDayKg = 1.5
    private static let bodyFatAlert = 2.0

    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    let onSaved: () -> Void

    @State private var active: Field = .weight
    @State private var weight: Double = 80
    @State private var bodyFat: Double = 20
    @State private var bodyFatSkipped = false
    @State private var showTypeEntry = false
    @State private var didSeed = false

    private var unit: WeightUnit { store.context.effectiveWeightUnit }

    /// One detent in the current display unit. 0.1 kg's ~45 g equivalent in
    /// lbs (0.1 lb) is finer than the scale's real precision and would make
    /// the dial feel twitchier than the kg version, so lbs steps by 0.2
    /// instead — close to the same physical turn per haptic tick.
    private var step: Double { unit == .lbs ? 0.2 : 0.1 }
    /// Clamping the dial to a window around the seed caps it at roughly 2.5
    /// turns and makes overshoot self-correcting. The long-press text field is
    /// the escape hatch for genuine jumps.
    private var weightWindow: Double { unit.fromKg(Self.weightWindowKg) }
    /// Base "does this look wrong?" threshold, widened by days elapsed so a week
    /// away doesn't cry wolf.
    private var weightAlertPerDay: Double { unit.fromKg(Self.weightAlertPerDayKg) }

    /// `weight`/`bodyFat` above are always in the current display unit — the
    /// crown dials, the text shows, and the typed-entry sheet all read and
    /// write that unit directly. Conversion to kg happens once, at `save()`,
    /// which is the one place a value crosses into `CheckInStore`/the wire.
    private var seedWeight: Double { unit.fromKg(store.seedWeightKg ?? 80) }
    private var seedBodyFat: Double { store.seedBodyFatPercentage ?? 20 }

    private var weightDelta: Double? {
        guard let comparison = store.comparisonWeightKg else { return nil }
        return weight - unit.fromKg(comparison)
    }

    /// Threshold scales with the gap since the last entry — one night legitimately
    /// moves less than a fortnight away does.
    private var weightAlertThreshold: Double {
        weightAlertPerDay * Double(min(store.context.daysSinceLastEntry, 7))
    }

    private var weightLooksWrong: Bool {
        guard let delta = weightDelta else { return false }
        return abs(delta) > weightAlertThreshold
    }

    private var bodyFatLooksWrong: Bool {
        guard !bodyFatSkipped, let comparison = store.context.lastBodyFatPercentage else { return false }
        return abs(bodyFat - comparison) > Self.bodyFatAlert
    }

    private var looksWrong: Bool { weightLooksWrong || bodyFatLooksWrong }

    /// On a boring morning this reads "Save". When something is off it names the
    /// change out loud, so an implausible value can still be saved — just never
    /// unknowingly.
    private var saveLabel: String {
        guard looksWrong, let delta = weightDelta, weightLooksWrong else { return "Save" }
        return "Save \(String(format: "%+.1f", delta)) \(unit.suffix)"
    }

    var body: some View {
        VStack(spacing: 2) {
            header

            Spacer(minLength: 0)

            activeValue
            deltaLine
            inactiveValue

            Spacer(minLength: 0)

            actionButton
        }
        .padding(.horizontal, 4)
        .focusable(true)
        .digitalCrownRotation(
            crownBinding,
            from: crownRange.lowerBound,
            through: crownRange.upperBound,
            by: step,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
        .id(active)
        .onAppear(perform: seedIfNeeded)
        .sheet(isPresented: $showTypeEntry) {
            TypedValueEntryView(
                title: active == .weight ? "Weight (\(unit.suffix))" : "Body fat (%)",
                initial: active == .weight ? weight : bodyFat
            ) { typed in
                if active == .weight { weight = typed } else { bodyFat = typed; bodyFatSkipped = false }
            }
        }
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(spacing: 4) {
            Text(CheckInDate.headerLabel(for: CheckInDate.today()))
            if store.isReplacingToday {
                Text("· replacing").foregroundStyle(.orange)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }

    private var activeValue: some View {
        HStack(alignment: .lastTextBaseline, spacing: 2) {
            Text(activeText)
                .font(.system(size: 46, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .contentTransition(.numericText())
            Text(active == .weight ? unit.suffix : "%")
                .font(.title3)
                .foregroundStyle(.secondary)
        }
        .onLongPressGesture { showTypeEntry = true }
    }

    private var activeText: String {
        String(format: "%.1f", active == .weight ? weight : bodyFat)
    }

    @ViewBuilder
    private var deltaLine: some View {
        if let delta = weightDelta, active == .weight {
            Text("\(String(format: "%+.1f", delta)) \(unit.suffix) since last")
                .font(weightLooksWrong ? .footnote.bold() : .caption2)
                .foregroundStyle(weightLooksWrong ? .orange : .secondary)
                .animation(.snappy, value: weightLooksWrong)
        } else if active == .bodyFat, let comparison = store.context.lastBodyFatPercentage, !bodyFatSkipped {
            Text(String(format: "%+.1f %% since last", bodyFat - comparison))
                .font(bodyFatLooksWrong ? .footnote.bold() : .caption2)
                .foregroundStyle(bodyFatLooksWrong ? .orange : .secondary)
        } else {
            Text(" ").font(.caption2)
        }
    }

    /// The other value, small and dimmed. Tapping it swaps focus — that is the
    /// in-session correction path, no navigation involved.
    private var inactiveValue: some View {
        Button {
            withAnimation(.snappy) { active = active == .weight ? .bodyFat : .weight }
        } label: {
            Text(inactiveText)
                .font(.title3)
                .monospacedDigit()
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
    }

    private var inactiveText: String {
        if active == .weight {
            return bodyFatSkipped ? "— %" : String(format: "%.1f %%", bodyFat)
        }
        return "\(String(format: "%.1f", weight)) \(unit.suffix)"
    }

    private var actionButton: some View {
        VStack(spacing: 2) {
            Button(active == .weight ? "Next" : saveLabel) {
                if active == .weight {
                    withAnimation(.snappy) { active = .bodyFat }
                } else {
                    save()
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .tint(looksWrong && active == .bodyFat ? .orange : .accentColor)

            // Impedance readings fail routinely on dry feet. Skipping OMITS the
            // field rather than sending null, so a previously recorded value for
            // the day is left intact rather than erased by the upsert.
            if active == .bodyFat {
                Button("Skip body fat") {
                    bodyFatSkipped = true
                    save()
                }
                .buttonStyle(.plain)
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - Crown plumbing

    /// One crown modifier routed to whichever field has focus, so there is only
    /// ever a single dial on screen.
    private var crownBinding: Binding<Double> {
        Binding(
            get: { active == .weight ? weight : bodyFat },
            set: { newValue in
                if active == .weight {
                    weight = newValue
                } else {
                    bodyFat = newValue
                    bodyFatSkipped = false
                }
            }
        )
    }

    private var crownRange: ClosedRange<Double> {
        if active == .weight {
            return (seedWeight - weightWindow)...(seedWeight + weightWindow)
        }
        return max(0, seedBodyFat - Self.bodyFatWindow)...min(100, seedBodyFat + Self.bodyFatWindow)
    }

    // MARK: - Actions

    private func seedIfNeeded() {
        guard !didSeed else { return }
        didSeed = true
        weight = seedWeight
        bodyFat = seedBodyFat
    }

    private func save() {
        // Round to display-unit precision first (what the wearer actually
        // dialled/typed), then convert — rounding in kg afterward would distort
        // a lbs entry that doesn't land on a clean 0.1 kg boundary.
        let roundedWeight = (weight * 10).rounded() / 10
        let checkIn = store.capture(
            weightKg: unit.toKg(roundedWeight),
            bodyFatPercentage: bodyFatSkipped ? nil : (bodyFat * 10).rounded() / 10
        )
        let state = session.send(checkIn)
        store.markState(state, for: checkIn)
        WKInterfaceDevice.current().play(.success)
        onSaved()
    }
}

/// Deliberately slow path for the once-or-twice-a-year genuine jump that falls
/// outside the crown's window. Scribble and dictation both work here.
struct TypedValueEntryView: View {
    let title: String
    let initial: Double
    let onCommit: (Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            TextField("0.0", text: $text)
                .font(.title3)
                .multilineTextAlignment(.center)
            Button("Set") {
                let normalized = text.replacingOccurrences(of: ",", with: ".")
                if let value = Double(normalized) { onCommit(value) }
                dismiss()
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .onAppear { text = String(format: "%.1f", initial) }
    }
}
