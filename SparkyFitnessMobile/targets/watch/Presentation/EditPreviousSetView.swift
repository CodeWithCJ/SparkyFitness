import SwiftUI

/// Edit a set already logged: the same weight and reps boxes as the set screen
/// (tap one to type the number) and a `‹ Save ›` row. `‹` and `›` step through
/// the logged sets in workout order, so on an exercise's first set `‹` goes to
/// the last set of the one before. Save sends what changed to the phone and
/// returns to the current set.
struct EditPreviousSetView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.dismiss) private var dismiss

    private enum Field: Identifiable {
        case weight, reps
        var id: Int { self == .weight ? 0 : 1 }
    }

    /// Position in the logged sets, starting at the one logged last before the
    /// cursor.
    @State private var index: Int
    /// Sets edited here, sent on Save or when stepping away from them.
    @State private var edited: Set<String> = []
    @State private var editing: Field?

    private var logged: [WorkoutStep] { store.steps.filter(store.isCompleted) }
    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }

    init(startingAt index: Int) {
        _index = State(initialValue: index)
    }

    /// The logged set nearest before the cursor, else the last one logged.
    static func startIndex(in store: WorkoutSessionStore) -> Int {
        let logged = store.steps.filter(store.isCompleted)
        let before = logged.lastIndex { step in
            store.steps.firstIndex(of: step).map { $0 < store.currentStepIndex } ?? false
        }
        return before ?? max(0, logged.count - 1)
    }

    var body: some View {
        let sets = logged
        if sets.indices.contains(index) {
            content(for: sets[index], count: sets.count)
        } else {
            Text(String(localized: "watch.workout.noLoggedSets", defaultValue: "No sets logged yet"))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    private func content(for step: WorkoutStep, count: Int) -> some View {
        let values = store.values(for: step)
        return VStack(spacing: 4) {
            Text(step.exerciseName)
                .font(.headline)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(step.label)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            HStack(spacing: 4) {
                ValueBox(value: SetValueText.format(values.weightKg.map(unit.fromKg)), unit: unit == .lbs ? "LB" : "KG") {
                    editing = .weight
                }
                ValueBox(value: SetValueText.format(values.reps), unit: "REPS") {
                    editing = .reps
                }
            }
            HStack(spacing: 6) {
                SquircleButton(systemImage: "chevron.left") { move(by: -1) }
                    .frame(width: WatchStyle.s(40))
                    .disabled(index == 0)
                Button(action: Haptics.tapping(save)) {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.headline)
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.s(44))
                        .background(Color.white, in: WatchStyle.shape)
                        .contentShape(WatchStyle.shape)
                }
                .buttonStyle(.plain)
                SquircleButton(systemImage: "chevron.right") { move(by: 1) }
                    .frame(width: WatchStyle.s(40))
                    .disabled(index >= count - 1)
            }
        }
        .onDisappear(perform: sendEdited)
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: field == .weight ? (unit == .lbs ? "LB" : "KG") : "REPS",
                initial: field == .weight ? values.weightKg.map(unit.fromKg) : values.reps,
                allowsDecimal: field == .weight,
                allowsNegative: field == .weight && store.isBodyweight(step)
            ) { entered in
                if field == .weight {
                    store.setValue(for: step.plannedSet.setId, weightKg: unit.toKg(entered))
                } else {
                    store.setValue(for: step.plannedSet.setId, reps: entered)
                }
                edited.insert(step.plannedSet.setId)
                editing = nil
            }
        }
    }

    private func move(by delta: Int) {
        index = min(max(index + delta, 0), logged.count - 1)
    }

    private func save() { dismiss() }

    /// Re-sends each edited set, however the screen closes: the phone patches
    /// the values of a set it already has logged, and logging it again
    /// changes nothing else.
    private func sendEdited() {
        for step in logged where edited.contains(step.plannedSet.setId) {
            session.sendSetCompleted(step, values: store.values(for: step))
        }
    }
}
