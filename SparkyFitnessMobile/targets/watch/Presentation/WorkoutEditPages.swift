import SwiftUI

/// The pages under the set screen, reached by scrolling up from the bottom:
/// what can be done to this set, to this exercise, and to the workout.
///
/// Every change is a request to the phone, which owns the workout. It applies
/// the change and sends the updated plan back, so the screen follows a moment
/// after the tap rather than changing locally.

// MARK: - Set options

struct SetOptionsPage: View {
    let step: WorkoutStep

    @EnvironmentObject private var session: WatchSessionManager
    @State private var choosingType = false
    @State private var confirmingDelete = false

    var body: some View {
        EditPage(title: "Set options") {
            Button("Add Set") {
                Haptics.tap()
                session.sendWorkoutEdit(.addSet(exerciseEntryId: step.exerciseEntryId))
            }
            Button("Set Type") {
                Haptics.tap()
                choosingType = true
            }
            Button("Delete Set") {
                Haptics.tap()
                confirmingDelete = true
            }
            .tint(.red)
            .buttonStyle(.borderedProminent)
        }
        .sheet(isPresented: $choosingType) {
            SetTypeSheet(current: step.plannedSet.setType) { type in
                session.sendWorkoutEdit(.setSetType(setId: step.plannedSet.setId, type: type))
            }
        }
        .confirmationDialog(
            "Delete this set?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteSet(setId: step.plannedSet.setId))
            }
            Button("Cancel", role: .cancel) { Haptics.tap() }
        } message: {
            Text("An exercise's last set removes the exercise.")
        }
    }
}

private struct SetTypeSheet: View {
    let current: String?
    let onPick: (String) -> Void

    @Environment(\.dismiss) private var dismiss

    private let types: [(id: String, name: String)] = [
        ("normal", "Normal"),
        ("warmup", "Warm-up"),
        ("drop", "Drop set"),
        ("failure", "Failure"),
    ]

    var body: some View {
        NavigationStack {
            List(types, id: \.id) { type in
                Button {
                    Haptics.tap()
                    onPick(type.id)
                    dismiss()
                } label: {
                    HStack {
                        Text(type.name)
                        Spacer(minLength: 0)
                        if (current ?? "normal").lowercased() == type.id {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
            .navigationTitle("Set Type")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Exercise options

struct ExerciseOptionsPage: View {
    let step: WorkoutStep

    @EnvironmentObject private var session: WatchSessionManager
    @State private var addingExercise = false
    @State private var confirmingDelete = false

    var body: some View {
        EditPage(title: "Exercise options") {
            Button("Add Exercise") {
                Haptics.tap()
                addingExercise = true
            }
            Button("Delete Exercise") {
                Haptics.tap()
                confirmingDelete = true
            }
            .tint(.red)
            .buttonStyle(.borderedProminent)
        }
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .confirmationDialog(
            "Delete \(step.exerciseName)?",
            isPresented: $confirmingDelete,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                Haptics.tap()
                session.sendWorkoutEdit(.deleteExercise(exerciseEntryId: step.exerciseEntryId))
            }
            Button("Cancel", role: .cancel) { Haptics.tap() }
        } message: {
            Text("Its sets are removed from this workout.")
        }
    }
}

// MARK: - Workout actions

/// Add an exercise, finish, or throw the workout away. The same end controls
/// the exercise list carries, one scroll from the set screen.
struct WorkoutActionsPage: View {
    @EnvironmentObject private var session: WatchSessionManager
    @State private var addingExercise = false
    @State private var confirmingFinish = false
    @State private var confirmingDiscard = false

    var body: some View {
        EditPage(title: "Workout") {
            Button("Add Exercise") {
                Haptics.tap()
                addingExercise = true
            }
            Button("Finish Workout") {
                Haptics.tap()
                confirmingFinish = true
            }
            .tint(.blue)
            .buttonStyle(.borderedProminent)
            Button("Discard Workout") {
                Haptics.tap()
                confirmingDiscard = true
            }
            .tint(.red)
            .buttonStyle(.borderedProminent)
        }
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .endWorkoutDialogs(
            confirmingFinish: $confirmingFinish,
            confirmingDiscard: $confirmingDiscard
        )
    }
}

// MARK: - Shared pieces

/// A page of big buttons under a small title, one screen tall.
private struct EditPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            content
                .font(.system(size: 15, weight: .semibold))
        }
        .frame(maxHeight: .infinity, alignment: .center)
        .padding(.horizontal, 2)
    }
}

/// The exercises the phone offered. A tap asks it to add one to the workout.
struct AddExerciseSheet: View {
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    private var exercises: [SuggestedExercise] { checkIn.context.suggestedExercises ?? [] }

    var body: some View {
        NavigationStack {
            Group {
                if exercises.isEmpty {
                    Text("Recent exercises appear here once your iPhone has sent them.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding()
                } else {
                    List(exercises) { exercise in
                        Button {
                            Haptics.tap()
                            session.sendWorkoutEdit(.addExercise(exerciseId: exercise.exerciseId))
                            dismiss()
                        } label: {
                            Text(exercise.name)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                        }
                    }
                }
            }
            .navigationTitle("Add Exercise")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// The Finish and Discard confirmations, shared by the exercise list and the
/// workout page so the wording and the order of events stay the same.
extension View {
    func endWorkoutDialogs(
        confirmingFinish: Binding<Bool>,
        confirmingDiscard: Binding<Bool>,
        beforeEnding: @escaping () -> Void = {}
    ) -> some View {
        modifier(EndWorkoutDialogs(
            confirmingFinish: confirmingFinish,
            confirmingDiscard: confirmingDiscard,
            beforeEnding: beforeEnding
        ))
    }
}

private struct EndWorkoutDialogs: ViewModifier {
    @Binding var confirmingFinish: Bool
    @Binding var confirmingDiscard: Bool
    let beforeEnding: () -> Void

    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var store: WorkoutSessionStore

    func body(content: Content) -> some View {
        content
            .confirmationDialog(
                "Finish workout?",
                isPresented: $confirmingFinish,
                titleVisibility: .visible
            ) {
                Button("Finish", role: .destructive) {
                    Haptics.tap()
                    // The caller's sheet is dismissed first so it is not
                    // re-rendering against a plan that `endWorkout` has
                    // already cleared.
                    beforeEnding()
                    if !store.askPresetUpdateBeforeFinish() { session.endWorkout() }
                }
                Button("Cancel", role: .cancel) { Haptics.tap() }
            } message: {
                Text("Heart rate for this session is sent to your phone.")
            }
            .confirmationDialog(
                "Discard workout?",
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button("Discard", role: .destructive) {
                    Haptics.tap()
                    beforeEnding()
                    session.discardWorkout()
                }
                Button("Cancel", role: .cancel) { Haptics.tap() }
            } message: {
                Text("This workout won't be saved.")
            }
    }
}
