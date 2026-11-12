import SwiftUI

/// Edit a set already logged: the boxes that fit the kind of set, as on the set
/// screen (weight and reps; distance for a carry; the hold's time, shown only,
/// for a timed set), tap one to type the number, and a `‹ Save ›` row. `‹` and
/// `›` step through the logged sets in workout order, so on an exercise's first
/// set `‹` goes to the last set of the one before. An edit reaches the phone
/// through the store's value-edit hook, as one made on the set screen does;
/// Save returns to the current set.
struct EditPreviousSetView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.dismiss) private var dismiss

    private enum Field: Identifiable {
        case weight, reps, distance
        var id: Int { self == .weight ? 0 : (self == .reps ? 1 : 2) }
    }

    /// Position in the logged sets, starting at the one logged last before the
    /// cursor.
    @State private var index: Int
    @State private var editing: Field?

    private var logged: [WorkoutStep] { store.steps.filter(store.isCompleted) }
    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }
    private var carryUnit: CarryUnit { checkIn.context.effectiveCarryUnit }

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
            let holdSeconds = store.targetDurationSec(for: step)
            let timed = store.isTimed(step)
            HStack(spacing: 4) {
                if !timed || values.weightKg != nil || store.isWeightedHold(step) {
                    ValueBox(value: SetValueText.format(values.weightKg.map(unit.fromKg)), unit: title(for: .weight)) {
                        editing = .weight
                    }
                }
                if let holdSeconds {
                    // The hold's time is logged by the timer, not typed.
                    ValueBox(value: SetValueText.short(holdSeconds), unit: String(localized: "watch.workout.holdTime", defaultValue: "TIME")) {}
                        .disabled(true)
                } else if timed {
                    EmptyView()
                } else if store.isCarry(step) {
                    ValueBox(value: SetValueText.format(values.distanceKm.map { (carryUnit.fromKm($0) * 10).rounded() / 10 }), unit: title(for: .distance)) {
                        editing = .distance
                    }
                } else {
                    ValueBox(value: SetValueText.format(values.reps), unit: title(for: .reps)) {
                        editing = .reps
                    }
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
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: title(for: field),
                initial: initial(for: field, values: values),
                allowsDecimal: field != .reps,
                allowsNegative: field == .weight && store.isBodyweight(step)
            ) { entered in
                switch field {
                case .weight: store.setValue(for: step.plannedSet.setId, weightKg: unit.toKg(entered))
                case .reps: store.setValue(for: step.plannedSet.setId, reps: entered)
                case .distance: store.setValue(for: step.plannedSet.setId, distanceKm: carryUnit.toKm(entered))
                }
                editing = nil
            }
        }
    }

    private func title(for field: Field) -> String {
        switch field {
        case .weight: return unit == .lbs ? "LB" : "KG"
        case .reps: return "REPS"
        case .distance: return carryUnit.title
        }
    }

    private func initial(for field: Field, values: SetValues) -> Double? {
        switch field {
        case .weight: return values.weightKg.map(unit.fromKg)
        case .reps: return values.reps
        case .distance: return values.distanceKm.map { (carryUnit.fromKm($0) * 10).rounded() / 10 }
        }
    }

    private func move(by delta: Int) {
        index = min(max(index + delta, 0), logged.count - 1)
    }

    private func save() { dismiss() }
}
