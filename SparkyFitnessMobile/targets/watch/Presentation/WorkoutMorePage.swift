import SwiftUI

/// What the set screen's "More" holds, in two one-screen stops above the set
/// (a stop taller than the screen would need a scroll inside the vertical
/// paging, which fights it): the next exercise with this set and this
/// exercise's actions, then the workout's. Every change is a request to the
/// phone, as on the original pages.

/// Up Next with Do first and List, then This set and Exercise.
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

    var body: some View {
        let upcoming = store.upcomingExercises
        VStack(spacing: WatchStyle.s(4)) {
            upNext(upcoming.first)
            section(String(localized: "watch.workout.moreThisSet", defaultValue: "This set"))
            HStack(spacing: 4) {
                MoreTile(String(localized: "watch.workout.moreType", defaultValue: "Type")) { choosingType = true }
                MoreTile(String(localized: "watch.workout.moreAdd", defaultValue: "Add")) {
                    session.sendWorkoutEdit(.addSet(exerciseEntryId: step.exerciseEntryId))
                }
                MoreTile(String(localized: "watch.workout.moreDelete", defaultValue: "Delete"), tint: .red) { confirmingDelete = true }
            }
            section(String(localized: "watch.workout.moreExercise", defaultValue: "Exercise"))
            HStack(spacing: 4) {
                if checkIn.context.exerciseDoNow == true, !upcoming.isEmpty {
                    MoreTile(String(localized: "watch.workout.moreSwap", defaultValue: "Swap")) { swapping = true }
                }
                if let next = upcoming.first {
                    MoreTile(String(localized: "watch.workout.moreSkip", defaultValue: "Skip")) {
                        store.jumpToExercise(next.exerciseEntryId)
                    }
                }
                MoreTile(String(localized: "watch.workout.moreDelete", defaultValue: "Delete"), tint: .red) { confirmingDeleteExercise = true }
            }
        }
        .padding(.horizontal, 2)
        .sheet(isPresented: $choosingType) {
            SetTypeSheet(current: step.plannedSet.setType) { type in
                session.sendWorkoutEdit(.setSetType(setId: step.plannedSet.setId, type: type))
            }
        }
        .sheet(isPresented: $swapping) { SwapExerciseSheet() }
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

    private func upNext(_ next: WorkoutStep?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(String(localized: "watch.workout.upNextTitle", defaultValue: "Up Next"))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
            if let next {
                Text(next.exerciseName)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let target = SetValueText.target(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit) {
                    Text(target)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                HStack(spacing: 4) {
                    if checkIn.context.exerciseDoNow == true, let anchor = store.currentStep?.exerciseEntryId {
                        MoreTile(String(localized: "watch.workout.doFirst", defaultValue: "Do first"), height: 30) {
                            session.sendWorkoutEdit(.doExerciseNow(exerciseEntryId: next.exerciseEntryId, anchorEntryId: anchor))
                            store.jumpToExercise(next.exerciseEntryId)
                        }
                    }
                    MoreTile(String(localized: "watch.workout.moreList", defaultValue: "List"), height: 30, action: onOpenList)
                }
            } else {
                Text(String(localized: "watch.workout.lastExercise", defaultValue: "This is the last exercise"))
                    .font(.footnote)
                MoreTile(String(localized: "watch.workout.moreList", defaultValue: "List"), height: 30, action: onOpenList)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(WatchStyle.s(8))
        .background(WatchStyle.fill, in: WatchStyle.shape)
    }

    private func section(_ title: String) -> some View {
        Text(title)
            .font(.footnote)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
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
        VStack(spacing: WatchStyle.s(4)) {
            Text(String(localized: "watch.workout.title", defaultValue: "Workout"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                MoreTile(String(localized: "watch.workout.moreWater", defaultValue: "Water")) { logWater = true }
                MoreTile(String(localized: "watch.workout.undoSet", defaultValue: "Undo Set")) {
                    if let step = lastLogged, store.uncompleteStep(step) {
                        session.sendSetUncompleted(step)
                    }
                }
                .disabled(lastLogged == nil)
            }
            HStack(spacing: 4) {
                MoreTile(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise")) { addingExercise = true }
                MoreTile(String(localized: "watch.common.discard", defaultValue: "Discard"), tint: .red) { confirmingDiscard = true }
            }
            MoreTile(String(localized: "watch.workout.finishWorkout", defaultValue: "Finish Workout"), fill: .blue) { confirmingFinish = true }
        }
        .padding(.horizontal, 2)
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .sheet(isPresented: $logWater) { WaterIntakeView() }
        .endWorkoutDialogs(
            confirmingFinish: $confirmingFinish,
            confirmingDiscard: $confirmingDiscard
        )
    }
}

/// One compact action tile: a label in a flat squircle, one line that shrinks
/// rather than wraps.
private struct MoreTile: View {
    let title: String
    var tint: Color = .white
    var fill: Color = WatchStyle.fill
    var height: CGFloat = 36
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    init(_ title: String, tint: Color = .white, fill: Color = WatchStyle.fill, height: CGFloat = 36, action: @escaping () -> Void) {
        self.title = title
        self.tint = tint
        self.fill = fill
        self.height = height
        self.action = action
    }

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(tint)
                .padding(.horizontal, 4)
                .frame(maxWidth: .infinity)
                .frame(height: WatchStyle.s(height))
                .background(fill, in: WatchStyle.shape)
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(WatchStyle.shape)
        }
        .buttonStyle(.plain)
    }
}
