import SwiftUI

/// Edit a set already logged: the boxes that fit the kind of set, as on the set
/// screen (weight and reps; distance for a carry; the hold's time, shown only,
/// for a timed set), tap one to type the number, and a `‹ Save ›` row. `‹` and
/// `›` step through the logged sets in the order they were logged, across
/// exercises and supersets; `›` on the newest returns to the current set. An
/// edit is held here until Save, which writes it (through the store's value-edit
/// hook, as one made on the set screen does) and returns to the current set;
/// moving to another set drops it.
struct EditPreviousSetView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.setTint) private var tint

    private enum Field: Identifiable {
        case weight, reps, distance
        var id: Int { self == .weight ? 0 : (self == .reps ? 1 : 2) }
    }

    /// Position in the logged sets, oldest first, starting at the one logged last.
    @State private var index: Int
    @State private var editing: Field?
    /// The set on screen, by id: a phone update can unlog an earlier set and
    /// shift the positions under `index`.
    @State private var selectedId: String?
    /// Edits not saved yet, and the set they were made on. A draft whose set is
    /// not the one on screen (it was unlogged) is ignored, never saved elsewhere.
    @State private var draft = SetValues()
    @State private var draftSetId: String?

    private var logged: [WorkoutStep] { store.loggedSteps }
    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }
    private var carryUnit: CarryUnit { checkIn.context.effectiveCarryUnit }

    /// Called by Save: the page that presented this closes it.
    let onClose: () -> Void

    init(startingAt index: Int, onClose: @escaping () -> Void) {
        _index = State(initialValue: index)
        self.onClose = onClose
    }

    /// The set logged last.
    static func startIndex(in store: WorkoutSessionStore) -> Int {
        max(0, store.loggedSteps.count - 1)
    }

    var body: some View {
        let sets = logged
        Group {
            if let shown = shownIndex(in: sets) {
                content(for: sets[shown], at: shown, count: sets.count)
            } else {
                Text(String(localized: "watch.workout.noLoggedSets", defaultValue: "No sets logged yet"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .onChange(of: sets.map { $0.plannedSet.setId }) { reconcile(with: logged) }
    }

    /// Where the selected set is now, else the stored position when it is still valid.
    private func shownIndex(in sets: [WorkoutStep]) -> Int? {
        if let selectedId, let found = sets.firstIndex(where: { $0.plannedSet.setId == selectedId }) {
            return found
        }
        // The selected set was unlogged: stay on a set that remains, the nearest
        // position, rather than a position past the end.
        return sets.isEmpty ? nil : min(max(index, 0), sets.count - 1)
    }

    /// The selected set was unlogged on the phone: drop its draft, so logging
    /// it again does not bring the old edit back, and move to a remaining set
    /// or close the editor when none remain.
    private func reconcile(with sets: [WorkoutStep]) {
        if let draftSetId, !sets.contains(where: { $0.plannedSet.setId == draftSetId }) {
            draft = SetValues()
            self.draftSetId = nil
        }
        guard let selectedId, !sets.contains(where: { $0.plannedSet.setId == selectedId }) else { return }
        guard !sets.isEmpty else {
            onClose()
            return
        }
        index = min(max(index, 0), sets.count - 1)
        self.selectedId = sets[index].plannedSet.setId
    }

    /// The unsaved edits, only while they belong to `step`.
    private func draft(for step: WorkoutStep) -> SetValues {
        draftSetId == step.plannedSet.setId ? draft : SetValues()
    }

    private func content(for step: WorkoutStep, at position: Int, count: Int) -> some View {
        let pending = draft(for: step)
        var values = store.values(for: step)
        if let weight = pending.weightKg { values.weightKg = weight }
        if let reps = pending.reps { values.reps = reps }
        if let distance = pending.distanceKm { values.distanceKm = distance }
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                HStack(spacing: WatchStyle.m(7)) {
                    Text("✎")
                        .font(.system(size: WatchStyle.m(17)))
                        .frame(width: WatchStyle.m(34), height: WatchStyle.m(34))
                        .background(tint.pillIcon, in: Circle())
                    Text(String(localized: "watch.workout.editingSet", defaultValue: "Set \(step.setNumber)"))
                        .font(.system(size: WatchStyle.m(17), weight: .semibold))
                        .monospacedDigit()
                }
                .foregroundStyle(tint.color)
                .padding(.leading, WatchStyle.m(4))
                .padding(.trailing, WatchStyle.m(13))
                .frame(height: WatchStyle.m(42))
                .background(tint.pill, in: Capsule())
                .padding(.leading, WatchStyle.pillCornerExtra)
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
            .padding(.leading, WatchStyle.m(4))
            .frame(height: WatchStyle.m(18))
            .padding(.top, WatchStyle.m(2))
            let holdSeconds = store.targetDurationSec(for: step)
            let timed = store.isTimed(step)
            HStack(spacing: WatchStyle.m(6)) {
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
                RoundBackButton { moveOlder(from: position) }
                    .disabled(LoggedSetOrder.older(than: position) == nil)
                    .accessibilityLabel(String(localized: "watch.workout.previousLoggedSet", defaultValue: "Previous logged set"))
                Button(action: Haptics.tapping { save(step) }) {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.system(size: WatchStyle.m(17), weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(44))
                        .background(Color.white, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                RoundBackButton(glyph: "›") { moveNewer(from: position, count: count) }
                    .accessibilityLabel(String(localized: "watch.workout.nextLoggedSet", defaultValue: "Next set"))
            }
            .padding(.bottom, WatchStyle.bottom)
        }
        .padding(.horizontal, WatchStyle.overlaySide)
        .padding(.top, WatchStyle.top)
        .ignoresSafeArea(edges: .top)
        .frame(maxHeight: .infinity, alignment: .top)
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: title(for: field),
                initial: initial(for: field, values: values),
                allowsDecimal: field != .reps,
                allowsNegative: field == .weight && store.isBodyweight(step)
            ) { entered in
                var next = pending
                switch field {
                case .weight: next.weightKg = unit.toKg(entered)
                case .reps: next.reps = entered
                case .distance: next.distanceKm = carryUnit.toKm(entered)
                }
                draft = next
                draftSetId = step.plannedSet.setId
                selectedId = step.plannedSet.setId
                editing = nil
            }
        }
    }

    private func title(for field: Field) -> String {
        switch field {
        case .weight: return unit == .lbs ? "LB" : "KG"
        case .reps: return String(localized: "watch.workout.field.reps", defaultValue: "Reps").uppercased()
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

    /// Moving never saves: the edits made on this set are dropped.
    private func moveOlder(from position: Int) {
        guard let older = LoggedSetOrder.older(than: position) else { return }
        select(older)
    }

    private func moveNewer(from position: Int, count: Int) {
        switch LoggedSetOrder.newer(than: position, count: count) {
        case .set(let newer): select(newer)
        case .current:
            draft = SetValues()
            draftSetId = nil
            onClose()
        }
    }

    private func select(_ position: Int) {
        draft = SetValues()
        draftSetId = nil
        index = position
        selectedId = logged.indices.contains(position) ? logged[position].plannedSet.setId : nil
    }

    private func save(_ step: WorkoutStep) {
        let pending = draft(for: step)
        store.setValue(
            for: step.plannedSet.setId,
            weightKg: pending.weightKg,
            reps: pending.reps,
            distanceKm: pending.distanceKm
        )
        onClose()
    }
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
