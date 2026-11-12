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
            if let plates { PlatesSheet(config: plates.config, weightKg: plates.weightKg) }
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

/// Plates per side for a set's weight: the bar, each plate on one side, and,
/// when the weight cannot be built from the plates owned, the nearest weights
/// either side of it.
struct PlatesSheet: View {
    let config: WatchPlateConfig
    let weightKg: Double

    private var unit: String { config.unit }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WatchStyle.m(8)) {
                    row(String(localized: "watch.workout.platesBar", defaultValue: "Bar"), "\(WatchPlates.number(config.barWeight)) \(unit)")
                    switch WatchPlates.calculate(targetKg: weightKg, config: config) {
                    case .exact(let load):
                        perSide(load)
                    case .inexact(let below, let above):
                        inexact(below: below, above: above)
                    case .invalid:
                        Text(String(localized: "watch.workout.platesUnavailable", defaultValue: "Cannot work this out"))
                            .font(.footnote)
                            .foregroundStyle(WatchStyle.grey)
                    }
                }
                .padding(.horizontal, WatchStyle.m(4))
            }
            .navigationTitle(String(localized: "watch.workout.morePlates", defaultValue: "Plates"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    @ViewBuilder
    private func perSide(_ load: WatchPlates.Load) -> some View {
        heading(String(localized: "watch.workout.platesPerSide", defaultValue: "Per side"))
        if load.plates.isEmpty {
            Text(String(localized: "watch.workout.platesBarOnly", defaultValue: "Bar only"))
                .font(.system(size: WatchStyle.m(18), weight: .semibold))
        } else {
            ForEach(load.plates, id: \.weight) { plate in
                row("\(WatchPlates.number(plate.weight)) \(unit)", "×\(plate.count)", strong: true)
            }
        }
        row(String(localized: "watch.workout.platesTotal", defaultValue: "Total"), "\(WatchPlates.number(load.total)) \(unit)")
    }

    @ViewBuilder
    private func inexact(below: WatchPlates.Load?, above: WatchPlates.Load?) -> some View {
        Text(String(localized: "watch.workout.platesNotExactLong", defaultValue: "Your plates cannot make exactly \(WatchPlates.number(WatchPlates.inUnit(weightKg, of: config))) \(unit)."))
            .font(.footnote)
            .foregroundStyle(WatchStyle.grey)
        let closest = [below, above].compactMap { $0 }
        if !closest.isEmpty {
            row(
                String(localized: "watch.workout.platesClosest", defaultValue: "Closest"),
                closest.map { WatchPlates.number($0.total) }.joined(separator: " / ") + " \(unit)",
                strong: true
            )
            ForEach(Array(closest.enumerated()), id: \.offset) { _, load in
                row(WatchPlates.number(load.total), load.plates.isEmpty ? String(localized: "watch.workout.platesBarOnly", defaultValue: "Bar only") : WatchPlates.summary(load.plates))
            }
        }
    }

    private func heading(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: WatchStyle.m(12), weight: .bold))
            .tracking(0.5)
            .foregroundStyle(WatchStyle.grey)
            .accessibilityAddTraits(.isHeader)
    }

    private func row(_ title: String, _ value: String, strong: Bool = false) -> some View {
        HStack(spacing: WatchStyle.m(6)) {
            Text(title)
                .font(.system(size: WatchStyle.m(15), weight: strong ? .semibold : .regular))
                .foregroundStyle(strong ? Color.white : WatchStyle.grey)
            Spacer(minLength: 0)
            Text(value)
                .font(.system(size: WatchStyle.m(15), weight: .semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .padding(.horizontal, WatchStyle.m(10))
        .frame(minHeight: WatchStyle.m(36))
        .background(WatchStyle.surface, in: RoundedRectangle(cornerRadius: WatchStyle.m(12), style: .continuous))
    }
}
