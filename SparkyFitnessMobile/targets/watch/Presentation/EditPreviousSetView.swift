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
    @Environment(\.setTint) private var tint

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
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                HStack(spacing: WatchStyle.m(8)) {
                    Image(systemName: "pencil")
                        .font(.system(size: WatchStyle.m(17), weight: .semibold))
                        .frame(width: WatchStyle.m(36), height: WatchStyle.m(36))
                        .background(tint.pillIcon, in: Circle())
                    Text(String(localized: "watch.workout.editingSet", defaultValue: "Set \(step.setNumber)"))
                        .font(.system(size: WatchStyle.m(18), weight: .semibold))
                        .monospacedDigit()
                }
                .foregroundStyle(tint.color)
                .padding(.leading, WatchStyle.m(5))
                .padding(.trailing, WatchStyle.m(14))
                .frame(height: WatchStyle.m(46))
                .background(tint.pill, in: Capsule())
                Spacer(minLength: 0)
            }
            SetTitle(name: step.exerciseName)
                .padding(.top, WatchStyle.m(6))
            HStack(spacing: WatchStyle.m(8)) {
                Text((step.equipment ?? step.label) + " · " + String(localized: "watch.workout.logged", defaultValue: "logged"))
                    .font(.system(size: WatchStyle.m(15)))
                    .foregroundStyle(WatchStyle.grey)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                EditSetDots(step: step)
            }
            .padding(.leading, WatchStyle.m(3))
            .frame(height: WatchStyle.m(18))
            .padding(.top, WatchStyle.m(3))
            let holdSeconds = store.targetDurationSec(for: step)
            let timed = store.isTimed(step)
            HStack(spacing: WatchStyle.m(5)) {
                if !timed || values.weightKg != nil || store.isWeightedHold(step) {
                    ValueBox(
                        value: SetValueText.format(values.weightKg.map(unit.fromKg)),
                        label: String(localized: "watch.workout.field.weight", defaultValue: "Weight").uppercased(),
                        suffix: unit == .lbs ? "lb" : "kg"
                    ) {
                        editing = .weight
                    }
                }
                if let holdSeconds {
                    // The hold's time is logged by the timer, not typed.
                    ValueBox(
                        value: SetValueText.short(holdSeconds),
                        label: String(localized: "watch.workout.holdTime", defaultValue: "TIME")
                    ) {}
                        .disabled(true)
                } else if timed {
                    EmptyView()
                } else if store.isCarry(step) {
                    ValueBox(
                        value: SetValueText.format(values.distanceKm.map { (carryUnit.fromKm($0) * 10).rounded() / 10 }),
                        label: String(localized: "watch.workout.field.distance", defaultValue: "Distance").uppercased(),
                        suffix: carryUnit.suffix
                    ) {
                        editing = .distance
                    }
                } else {
                    ValueBox(
                        value: SetValueText.format(values.reps),
                        label: String(localized: "watch.workout.field.reps", defaultValue: "Reps").uppercased()
                    ) {
                        editing = .reps
                    }
                }
            }
            .padding(.top, WatchStyle.m(6))
            Spacer(minLength: WatchStyle.m(8))
            HStack(spacing: WatchStyle.m(6)) {
                RoundBackButton { move(by: -1) }
                    .disabled(index == 0)
                    .accessibilityLabel(String(localized: "watch.workout.previousLoggedSet", defaultValue: "Previous logged set"))
                Button(action: Haptics.tapping(save)) {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.system(size: WatchStyle.m(17), weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(40))
                        .background(Color.white, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                RoundBackButton(glyph: "›") { move(by: 1) }
                    .disabled(index >= count - 1)
                    .accessibilityLabel(String(localized: "watch.workout.nextLoggedSet", defaultValue: "Next set"))
            }
            .padding(.bottom, WatchStyle.m(22))
        }
        .padding(.horizontal, max(0, WatchStyle.m(29) - 5.5))
        .padding(.top, WatchStyle.m(34))
        .ignoresSafeArea(edges: .top)
        .frame(maxHeight: .infinity, alignment: .top)
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

/// The dots of the set on screen, as on the set screen but for display only.
private struct EditSetDots: View {
    let step: WorkoutStep

    @EnvironmentObject private var store: WorkoutSessionStore
    @Environment(\.setTint) private var tint

    var body: some View {
        let sets = store.steps.filter { $0.exerciseEntryId == step.exerciseEntryId }
        if sets.count <= 6 {
            HStack(spacing: WatchStyle.m(4)) {
                ForEach(sets) { set in
                    let current = set.id == step.id
                    Circle()
                        .fill(current ? Color.white : (store.isCompleted(set) ? tint.color : Color.white.opacity(0.26)))
                        .frame(width: WatchStyle.m(current ? 8 : 6), height: WatchStyle.m(current ? 8 : 6))
                }
            }
            .accessibilityHidden(true)
        }
    }
}
