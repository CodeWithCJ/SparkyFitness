import SwiftUI

/// What the set screen's "More" holds, as one list above the set: the next
/// exercise, then this set's and this exercise's actions, then the workout's.
/// The three parts are stacked in the workout's own scroll (see
/// `ActiveWorkoutView`), which scrolls them freely with the crown or a swipe
/// and snaps to a page again once it reaches the set. Every change is a request
/// to the phone, as on the original pages. Drawn as the mockups' list: a blue
/// Up Next card and two-column tiles under small capitals headings.

/// Up Next with Do first and List.
struct WorkoutMoreUpNextPage: View {
    let onOpenList: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.setTint) private var tint

    var body: some View {
        let next = store.upcomingExercises.first
        VStack(alignment: .leading, spacing: WatchStyle.m(6)) {
            Text(String(localized: "watch.workout.moreTitle", defaultValue: "More"))
                .font(.system(size: WatchStyle.m(18), weight: .semibold))
                .foregroundStyle(tint.color)
                .frame(height: WatchStyle.m(42), alignment: .leading)
                .padding(.leading, WatchStyle.m(7))
            card(next)
        }
        .padding(.horizontal, MorePageInsets.horizontal)
        // Inside the page, which the scroll aligns to the top of the screen.
        .padding(.top, WatchStyle.top)
    }

    private func card(_ next: WorkoutStep?) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if let next {
                HStack(spacing: WatchStyle.m(4)) {
                    Text(String(localized: "watch.workout.nextLabel", defaultValue: "Next: "))
                        .font(.system(size: WatchStyle.m(20), weight: .medium))
                        .foregroundStyle(WatchStyle.lightGrey)
                        .fixedSize()
                    FitName(text: next.exerciseName, size: 20, color: next.supersetRun.map(SetSupersetPalette.color(for:)) ?? Color.white, height: WatchStyle.m(25))
                }
                .frame(height: WatchStyle.m(25))
                if let target = SetValueText.target(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit, spaced: true) {
                    Text(target)
                        .font(.system(size: WatchStyle.m(26), weight: .semibold, design: .rounded))
                        .foregroundStyle(tint.light)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .frame(height: WatchStyle.m(31))
                }
                Text(String(localized: "watch.workout.upNextSets", defaultValue: "\(next.setCount) sets"))
                    .font(.system(size: WatchStyle.m(17)))
                    .foregroundStyle(WatchStyle.lightGrey)
                    .frame(height: WatchStyle.m(21))
            } else {
                Text(String(localized: "watch.workout.lastExercise", defaultValue: "This is the last exercise"))
                    .font(.system(size: WatchStyle.m(17), weight: .semibold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: WatchStyle.m(6))
            HStack(spacing: WatchStyle.m(6)) {
                if next != nil, checkIn.context.exerciseDoNow == true, let anchor = store.currentStep?.exerciseEntryId, let next {
                    cardButton(String(localized: "watch.workout.doFirst", defaultValue: "Do first")) {
                        session.sendWorkoutEdit(.doExerciseNow(exerciseEntryId: next.exerciseEntryId, anchorEntryId: anchor))
                        store.jumpToExercise(next.exerciseEntryId)
                    }
                }
                cardButton(String(localized: "watch.workout.moreList", defaultValue: "List"), action: onOpenList)
            }
        }
        .padding(.horizontal, WatchStyle.m(12))
        .padding(.vertical, WatchStyle.m(9))
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(height: WatchStyle.m(168))
        .background(tint.mixed(0.26, over: (4 / 255, 18 / 255, 46 / 255)), in: RoundedRectangle(cornerRadius: WatchStyle.m(18), style: .continuous))
    }

    private func cardButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: Haptics.tapping(action)) {
            Text(title)
                .font(.system(size: WatchStyle.m(19), weight: .semibold))
                .foregroundStyle(Color.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity)
                .frame(height: WatchStyle.m(42))
                .background(WatchStyle.surface, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// This set's and this exercise's actions.
struct WorkoutMoreExercisePage: View {
    let step: WorkoutStep
    let onOpenList: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore

    @State private var choosingType = false
    @State private var confirmingDelete = false
    @State private var swapping = false
    @State private var confirmingDeleteExercise = false
    @State private var showingPlates = false

    var body: some View {
        let upcoming = store.upcomingExercises
        let plates = platesTile
        VStack(spacing: WatchStyle.m(6)) {
            MoreSection(String(localized: "watch.workout.moreThisSet", defaultValue: "This set"))
            MoreRow {
                MoreTile(
                    String(localized: "watch.workout.moreType", defaultValue: "Type"),
                    subtitle: Self.typeName(step.plannedSet.setType)
                ) { choosingType = true }
                if let plates {
                    MoreTile(String(localized: "watch.workout.morePlates", defaultValue: "Plates"), subtitle: plates.summary) { showingPlates = true }
                } else {
                    addSetTile
                }
            }
            if plates != nil {
                MoreRow {
                    addSetTile
                    deleteSetTile
                }
            } else {
                MoreRow(lone: true) { deleteSetTile }
            }
            MoreSection(String(localized: "watch.workout.moreExercise", defaultValue: "Exercise"))
            MoreRow {
                if checkIn.context.exerciseDoNow == true, !upcoming.isEmpty {
                    MoreTile(String(localized: "watch.workout.moreSwap", defaultValue: "Swap")) { swapping = true }
                }
                if let next = upcoming.first {
                    MoreTile(
                        String(localized: "watch.workout.moreSkip", defaultValue: "Skip"),
                        subtitle: String(localized: "watch.workout.moreSkipHint", defaultValue: "no log")
                    ) {
                        store.jumpToExercise(next.exerciseEntryId)
                    }
                }
            }
            MoreRow(lone: true) {
                MoreTile(String(localized: "watch.workout.moreDeleteExercise", defaultValue: "Delete Exercise"), destructive: true) { confirmingDeleteExercise = true }
            }
        }
        .modifier(MorePageInsets())
        .sheet(isPresented: $choosingType) {
            SetTypeSheet(current: step.plannedSet.setType) { type in
                session.sendWorkoutEdit(.setSetType(setId: step.plannedSet.setId, type: type))
            }
        }
        .sheet(isPresented: $swapping) { SwapExerciseSheet() }
        #if DEBUG
        .onAppear { if ScreenshotSeed.opensPlates { showingPlates = true } }
        #endif
        .sheet(isPresented: $showingPlates) {
            if let plates {
                PlatesSheet(config: plates.config, weightKg: plates.weightKg) { kg in
                    store.setValue(for: step.plannedSet.setId, weightKg: kg)
                }
            }
        }
        .confirmationDialog(
            String(localized: "watch.workout.deleteExerciseConfirm", defaultValue: "Delete \(step.exerciseName)?"),
            isPresented: $confirmingDeleteExercise,
            titleVisibility: .visible
        ) {
            Button(String(localized: "watch.common.delete", defaultValue: "Delete"), role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteExercise(exerciseEntryId: step.exerciseEntryId))
            }
            Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
        } message: {
            Text(String(localized: "watch.workout.deleteExerciseMessage", defaultValue: "Its sets are removed from this workout."))
        }
        .confirmationDialog(
            String(localized: "watch.workout.deleteSetConfirm", defaultValue: "Delete this set?"),
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button(String(localized: "watch.common.delete", defaultValue: "Delete"), role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteSet(setId: step.plannedSet.setId))
            }
            Button(String(localized: "watch.common.cancel", defaultValue: "Cancel"), role: .cancel) { Haptics.tap() }
        } message: {
            Text(String(localized: "watch.workout.lastSetRemovesExercise", defaultValue: "An exercise's last set removes the exercise."))
        }
    }

    private var addSetTile: some View {
        MoreTile(
            String(localized: "watch.workout.moreAddSet", defaultValue: "Add Set"),
            subtitle: String(localized: "watch.workout.moreAddSetHint", defaultValue: "+1 set")
        ) {
            session.sendWorkoutEdit(.addSet(exerciseEntryId: step.exerciseEntryId))
        }
    }

    private var deleteSetTile: some View {
        MoreTile(String(localized: "watch.workout.moreDeleteSet", defaultValue: "Delete Set"), destructive: true) { confirmingDelete = true }
    }

    /// The Plates tile, for a barbell exercise whose set has a weight: plates
    /// per side for the weight as it is now, so an edit on the wrist shows.
    private var platesTile: (config: WatchPlateConfig, weightKg: Double, summary: String)? {
        guard let config = step.plates, let weightKg = store.values(for: step).weightKg, weightKg > 0 else { return nil }
        let summary: String
        switch WatchPlates.calculate(targetKg: weightKg, config: config) {
        case .exact(let load):
            summary = load.plates.isEmpty
                ? String(localized: "watch.workout.platesBarOnly", defaultValue: "Bar only")
                : WatchPlates.summary(load.plates)
        case .inexact, .invalid:
            summary = String(localized: "watch.workout.platesNotExact", defaultValue: "Not exact")
        }
        return (config, weightKg, summary)
    }

    private static func typeName(_ type: String?) -> String {
        switch type?.lowercased() {
        case "warmup": return String(localized: "watch.workout.typeWarmup", defaultValue: "Warm-up")
        case "drop": return String(localized: "watch.workout.typeDrop", defaultValue: "Drop")
        case "failure": return String(localized: "watch.workout.typeFailure", defaultValue: "Failure")
        default: return String(localized: "watch.workout.typeNormal", defaultValue: "Normal")
        }
    }
}

/// Water, Undo Set, Add Exercise, Discard and Finish Workout.
struct WorkoutMoreWorkoutPage: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    @State private var addingExercise = false
    @State private var logWater = false
    @State private var confirmingFinish = false
    @State private var confirmingDiscard = false

    /// The most recently logged set in running order, the one Undo Set reopens.
    private var lastLogged: WorkoutStep? {
        store.steps.last(where: store.isCompleted)
    }

    var body: some View {
        VStack(spacing: WatchStyle.m(6)) {
            MoreSection(String(localized: "watch.workout.title", defaultValue: "Workout"))
            MoreRow {
                MoreTile(String(localized: "watch.workout.moreWater", defaultValue: "Water")) { logWater = true }
                MoreTile(
                    String(localized: "watch.workout.undoSet", defaultValue: "Undo Set"),
                    subtitle: String(localized: "watch.workout.undoSetHint", defaultValue: "remove last log")
                ) {
                    if let step = lastLogged, store.uncompleteStep(step) {
                        session.sendSetUncompleted(step)
                    }
                }
                .disabled(lastLogged == nil)
            }
            MoreRow {
                MoreTile(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise")) { addingExercise = true }
                MoreTile(String(localized: "watch.common.discard", defaultValue: "Discard"), destructive: true) { confirmingDiscard = true }
            }
            Button(action: Haptics.tapping { confirmingFinish = true }) {
                Text(String(localized: "watch.workout.finishWorkout", defaultValue: "Finish Workout"))
                    .font(.system(size: WatchStyle.m(16), weight: .bold))
                    .foregroundStyle(Color.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: WatchStyle.m(44))
                    .background(Color.white, in: RoundedRectangle(cornerRadius: WatchStyle.m(15), style: .continuous))
                    .contentShape(RoundedRectangle(cornerRadius: WatchStyle.m(15), style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, WatchStyle.m(2))
        }
        .modifier(MorePageInsets())
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .sheet(isPresented: $logWater) { WaterIntakeView() }
        .endWorkoutDialogs(
            confirmingFinish: $confirmingFinish,
            confirmingDiscard: $confirmingDiscard
        )
    }
}

/// Room under the system clock at the top right and above the page dots at the
/// bottom, which both sit over a full-screen page.
private struct MorePageInsets: ViewModifier {
    static var horizontal: CGFloat { WatchStyle.side }

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, Self.horizontal)
    }
}

/// A small capitals heading over a group of tiles.
private struct MoreSection: View {
    let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title.uppercased())
            .font(.system(size: WatchStyle.m(15), weight: .bold))
            .tracking(0.5)
            .foregroundStyle(WatchStyle.grey)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, WatchStyle.m(7))
            .padding(.top, WatchStyle.m(2))
            .accessibilityAddTraits(.isHeader)
    }
}

/// Two tiles side by side; a lone tile takes the left half.
private struct MoreRow<Content: View>: View {
    var lone = false
    @ViewBuilder let content: Content

    var body: some View {
        HStack(spacing: WatchStyle.m(6)) {
            content
            if lone { Color.clear.frame(maxWidth: .infinity, maxHeight: 0) }
        }
    }
}

/// One action tile: a title, an optional quieter line under it, in a flat
/// rounded square; destructive actions are red.
private struct MoreTile: View {
    let title: String
    var subtitle: String?
    var destructive = false
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, subtitle: String? = nil, destructive: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.subtitle = subtitle
        self.destructive = destructive
        self.action = action
    }

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.system(size: WatchStyle.m(23), weight: .semibold))
                    .foregroundStyle(destructive ? Color(red: 1, green: 138 / 255, blue: 142 / 255) : Color.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.75)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: WatchStyle.m(18)))
                        .foregroundStyle(WatchStyle.lightGrey)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, WatchStyle.m(10))
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: WatchStyle.m(82))
            .background(WatchStyle.surface, in: RoundedRectangle(cornerRadius: WatchStyle.m(14), style: .continuous))
            .opacity(isEnabled ? 1 : 0.35)
            .contentShape(RoundedRectangle(cornerRadius: WatchStyle.m(14), style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

/// The plate calculator for a set's weight. Opens at the set's weight and
/// shows the loaded bar, the total, and the plates on each side. The Digital
/// Crown and the − and + buttons move to the next weight the plates can make
/// (`WatchPlates.nextLoadable`); a weight they cannot make shows the two
/// nearest. "Use" writes the weight to the set, through the store's usual
/// value edit, and closes; closing any other way leaves the set as it was.
struct PlatesSheet: View {
    let config: WatchPlateConfig
    let weightKg: Double
    /// Writes the chosen weight (kg) to the set.
    let onUse: (Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var targetKg: Double
    @State private var crown = 0.0
    @State private var crownSeen = 0.0
    @FocusState private var crownFocused: Bool

    init(config: WatchPlateConfig, weightKg: Double, onUse: @escaping (Double) -> Void) {
        self.config = config
        self.weightKg = weightKg
        self.onUse = onUse
        _targetKg = State(initialValue: weightKg)
    }

    private var unit: String { config.unit }

    var body: some View {
        let result = WatchPlates.calculate(targetKg: targetKg, config: config)
        let shown = Self.shown(result)
        VStack(spacing: WatchStyle.m(5)) {
            HStack(spacing: WatchStyle.m(4)) {
                stepButton("−", up: false)
                HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(3)) {
                    Text(WatchPlates.number(WatchPlates.inUnit(targetKg, of: config)))
                        .font(.system(size: WatchStyle.num(38), weight: WatchStyle.numWeight))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(unit)
                        .font(.system(size: WatchStyle.m(16), weight: .semibold))
                        .foregroundStyle(WatchStyle.lightGrey)
                }
                .frame(maxWidth: .infinity)
                stepButton("+", up: true)
            }
            .padding(.top, WatchStyle.m(46))
            BarbellView(config: config, plates: shown?.plates ?? [], dim: !isExact(result))
                .frame(height: WatchStyle.m(70))
            Text(caption(result))
                .font(.system(size: WatchStyle.m(19), weight: .semibold))
                .foregroundStyle(isExact(result) ? Color.white : Color(red: 0.96, green: 0.70, blue: 0.20))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(height: WatchStyle.m(24))
            Text(String(localized: "watch.workout.platesBarLine", defaultValue: "Bar \(WatchPlates.number(config.barWeight)) \(unit)"))
                .font(.system(size: WatchStyle.m(15)))
                .foregroundStyle(WatchStyle.lightGrey)
            Spacer(minLength: 0)
            Button {
                if let kg = exactKg(result) {
                    Haptics.setLogged()
                    onUse(kg)
                    dismiss()
                }
            } label: {
                Text(String(localized: "watch.workout.platesUse", defaultValue: "Use \(WatchPlates.number(WatchPlates.inUnit(targetKg, of: config))) \(unit)"))
                    .font(.system(size: WatchStyle.m(19), weight: .bold))
                    .foregroundStyle(Color.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity)
                    .frame(height: WatchStyle.m(44))
                    .background(Color.white, in: Capsule())
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .disabled(!isExact(result))
            .opacity(isExact(result) ? 1 : 0.35)
        }
        .padding(.horizontal, WatchStyle.overlaySide)
        .padding(.bottom, WatchStyle.bottom)
        .focusable()
        .focused($crownFocused)
        .digitalCrownRotation($crown, from: -10_000, through: 10_000, by: 1, sensitivity: .low, isContinuous: true, isHapticFeedbackEnabled: true)
        .onChange(of: crown) {
            let detents = Int((crown - crownSeen).rounded())
            guard detents != 0 else { return }
            crownSeen += Double(detents)
            for _ in 0..<abs(detents) { step(up: detents > 0) }
        }
        .onAppear { crownFocused = true }
    }

    private func step(up: Bool) {
        if let next = WatchPlates.nextLoadable(from: targetKg, up: up, config: config) { targetKg = next }
    }

    private func stepButton(_ glyph: String, up: Bool) -> some View {
        Button { Haptics.tap(); step(up: up) } label: {
            Text(glyph)
                .font(.system(size: WatchStyle.m(28), weight: .semibold))
                .frame(width: WatchStyle.m(42), height: WatchStyle.m(42))
                .background(WatchStyle.surface, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(up
            ? String(localized: "watch.workout.platesHeavier", defaultValue: "Heavier")
            : String(localized: "watch.workout.platesLighter", defaultValue: "Lighter"))
    }

    private func isExact(_ result: WatchPlates.Result) -> Bool {
        if case .exact = result { return true }
        return false
    }

    private func exactKg(_ result: WatchPlates.Result) -> Double? {
        isExact(result) ? targetKg : nil
    }

    /// The load drawn: the exact one, else the nearest below, else above.
    private static func shown(_ result: WatchPlates.Result) -> WatchPlates.Load? {
        switch result {
        case .exact(let load): return load
        case .inexact(let below, let above): return below ?? above
        case .invalid: return nil
        }
    }

    /// Per side as "20 · 10 · 1.25", or the two nearest weights.
    private func caption(_ result: WatchPlates.Result) -> String {
        switch result {
        case .exact(let load):
            return load.plates.isEmpty
                ? String(localized: "watch.workout.platesBarOnly", defaultValue: "Bar only")
                : load.plates.flatMap { Array(repeating: WatchPlates.number($0.weight), count: $0.count) }.joined(separator: " · ")
        case .inexact(let below, let above):
            let nearest = [below, above].compactMap { $0 }.map { WatchPlates.number($0.total) }.joined(separator: " / ")
            return String(localized: "watch.workout.platesClosest", defaultValue: "Closest") + " " + nearest
        case .invalid:
            return String(localized: "watch.workout.platesUnavailable", defaultValue: "Cannot work this out")
        }
    }
}

/// One side of a barbell seen from the side: the bar, the plates in order from
/// the centre out, as rectangles whose height follows the weight, and the
/// collar.
private struct BarbellView: View {
    let config: WatchPlateConfig
    let plates: [WatchPlates.Count]
    let dim: Bool

    var body: some View {
        GeometryReader { proxy in
            let flat = plates.flatMap { Array(repeating: $0.weight, count: $0.count) }
            let height = proxy.size.height
            let thickness = min(WatchStyle.m(14), (proxy.size.width * 0.62) / CGFloat(max(flat.count, 6)))
            HStack(alignment: .center, spacing: 1) {
                // The stop at the centre of the bar.
                RoundedRectangle(cornerRadius: 2).fill(Color(white: 0.55))
                    .frame(width: WatchStyle.m(8), height: height * 0.34)
                ForEach(Array(flat.enumerated()), id: \.offset) { _, weight in
                    let kgWeight = config.unit == "lbs" ? weight * 0.45359237 : weight
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(Self.color(kgWeight))
                        .frame(width: thickness, height: max(height * 0.28, height * min(1, CGFloat(0.38 + kgWeight / 25 * 0.62))))
                }
                if config.collarWeight > 0 {
                    RoundedRectangle(cornerRadius: 2).fill(Color(white: 0.8))
                        .frame(width: WatchStyle.m(6), height: height * 0.3)
                }
                // The bar's sleeve running out past the plates.
                RoundedRectangle(cornerRadius: 3).fill(Color(white: 0.7))
                    .frame(maxWidth: .infinity)
                    .frame(height: height * 0.12)
            }
            .frame(width: proxy.size.width, height: height, alignment: .leading)
            .opacity(dim ? 0.4 : 1)
        }
        .accessibilityHidden(true)
    }

    /// The competition colours, by kg: 25 red, 20 blue, 15 yellow, 10 green,
    /// 5 white, then lighter ones in greys and orange.
    private static func color(_ kg: Double) -> Color {
        switch kg {
        case 25...: return Color(red: 0.90, green: 0.25, blue: 0.27)
        case 20...: return Color(red: 0.26, green: 0.52, blue: 0.96)
        case 15...: return Color(red: 0.96, green: 0.80, blue: 0.25)
        case 10...: return Color(red: 0.30, green: 0.75, blue: 0.40)
        case 5...: return Color(white: 0.92)
        case 2.5...: return Color(red: 0.95, green: 0.55, blue: 0.20)
        default: return Color(white: 0.62)
        }
    }
}
