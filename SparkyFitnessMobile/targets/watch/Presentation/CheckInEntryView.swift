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
    /// The unit `weight` below is currently expressed in, and nil until the
    /// first seed. Replaces a plain `didSeed` flag: latching on "have we
    /// seeded at all" left a stale unit behind whenever the phone changed it.
    @State private var seededUnit: WeightUnit?

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
        // `onAppear` alone isn't enough: this is a page in a `.page` TabView,
        // so it stays alive and doesn't appear again when the wearer swipes
        // back to it. A unit change arriving from the phone while it sits here
        // has to be caught on its own.
        .onChange(of: unit) { seedIfNeeded() }
        .sheet(isPresented: $showTypeEntry) {
            TypedValueEntryView(
                title: active == .weight ? "Weight (\(unit.suffix))" : "Body fat (%)",
                initial: active == .weight ? weight : bodyFat,
                range: typedEntryRange
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

    /// Sanity bounds for a *typed* value, in the unit on screen. The crown
    /// clamps itself — body fat to 0...100 in `crownRange` below — so this is
    /// the only entry point that needs stating.
    ///
    /// Not a medical range: the job here is keeping zero, negatives and
    /// infinities out of the payload. A weight of 0 sails through the server
    /// and then anchors every later crown session and trend line to itself,
    /// and a NaN makes `persist()`'s JSONEncoder throw into a `try?` so the
    /// check-in vanishes without a word. A wrong-but-plausible number is
    /// `weightLooksWrong`'s job, not this one's.
    private var typedEntryRange: ClosedRange<Double> {
        guard active == .weight else { return 0...100 }
        let lower = unit.fromKg(Self.typedWeightKgRange.lowerBound)
        let upper = unit.fromKg(Self.typedWeightKgRange.upperBound)
        return lower...upper
    }

    private static let typedWeightKgRange: ClosedRange<Double> = 2...500

    private var crownRange: ClosedRange<Double> {
        if active == .weight {
            return (seedWeight - weightWindow)...(seedWeight + weightWindow)
        }
        return max(0, seedBodyFat - Self.bodyFatWindow)...min(100, seedBodyFat + Self.bodyFatWindow)
    }

    // MARK: - Actions

    /// Seeds the dials, and re-expresses the weight if the phone has since
    /// changed the display unit.
    ///
    /// `weight` is held in the display unit, so a unit change without this
    /// leaves the number as it was while everything around it moves: the label
    /// reads "80.7 lbs" for a kg value, `crownRange` recentres on ~178 lbs and
    /// no longer contains it, and `save()`'s `unit.toKg(80.7)` writes 36.6 kg
    /// to the server. A wrong weight written silently is the worst outcome
    /// this screen has.
    ///
    /// Converted rather than re-seeded: an untouched dial converts to exactly
    /// what re-seeding would give, and a dial the wearer has already moved
    /// keeps the number they chose instead of losing it.
    private func seedIfNeeded() {
        guard let seededUnit else {
            weight = seedWeight
            bodyFat = seedBodyFat
            self.seededUnit = unit
            return
        }
        guard seededUnit != unit else { return }
        weight = unit.fromKg(seededUnit.toKg(weight))
        self.seededUnit = unit
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
    /// What may be committed, in the same unit `initial` is in. Scribble and
    /// dictation will hand over whatever they think they heard, and this is
    /// the one path into a check-in that the Digital Crown's own clamping
    /// doesn't cover.
    let range: ClosedRange<Double>
    let onCommit: (Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""

    /// Nil when what's typed isn't worth committing: unparseable, non-finite
    /// (`Double("nan")` and `Double("inf")` both parse happily), or outside
    /// `range`.
    ///
    /// Drives the commit and the button's enabled state from one place, so an
    /// invalid entry leaves the sheet open instead of dismissing having
    /// silently done nothing — the same shape `FirstRunEntryView` already
    /// uses for its Save button.
    private var parsed: Double? {
        let normalized = text.replacingOccurrences(of: ",", with: ".")
        guard let value = Double(normalized), value.isFinite, range.contains(value) else {
            return nil
        }
        return value
    }

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            TextField("0.0", text: $text)
                .font(.title3)
                .multilineTextAlignment(.center)
            Button("Set") {
                guard let parsed else { return }
                onCommit(parsed)
                dismiss()
            }
            .buttonStyle(.borderedProminent)
            .disabled(parsed == nil)
        }
        .padding()
        .onAppear { text = String(format: "%.1f", initial) }
    }
}
