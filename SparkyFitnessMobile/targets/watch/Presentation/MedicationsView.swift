import SwiftUI
import WatchKit

/// The Medications page, laid out like Apple's Medications app.
///
/// Today's doses in a list grouped by time ("8:00 AM", then "As Needed"),
/// one large row per dose: an icon, the name and the dose. Tapping a row opens
/// the dose, with big Taken and Skipped buttons; a group with more than one
/// dose still to take also has Log All as Taken. Every tap goes straight to
/// the phone — there is no local-only state. A logged dose can be cleared from
/// its screen after a mistaken tap, which deletes the entry on the phone.
struct MedicationsView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @State private var path: [String] = []

    /// Yesterday's doses are worse than none — discarded the same way
    /// `GoalSummaryView` discards stale nutrition.
    private var snapshot: MedicationSnapshot? {
        guard let snapshot = store.context.medications, snapshot.isToday else { return nil }
        return snapshot
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let snapshot, !snapshot.doses.isEmpty {
                    doseList(snapshot.doses)
                } else {
                    emptyState(synced: snapshot != nil)
                }
            }
            .navigationTitle(String(localized: "watch.medications.title", defaultValue: "Medications"))
            .toolbar {
                // Only while a tap is outstanding: a green tick on every visit
                // is noise. Scoped to this page's taps, so a red dot here is
                // always about a dose.
                if store.medicationSyncState != .saved {
                    ToolbarItem(placement: .topBarLeading) {
                        SyncStatusIcon(
                            state: store.medicationSyncState,
                            onRetry: { session.retryFailedMedicationTaps() }
                        )
                    }
                }
            }
            .navigationDestination(for: String.self) { doseId in
                if let dose = snapshot?.doses.first(where: { $0.id == doseId }) {
                    MedicationDoseView(dose: dose)
                }
            }
        }
        #if DEBUG
        .onAppear {
            if ScreenshotSeed.opensMedicationDose,
               let due = snapshot?.doses.first(where: { $0.status == .pending }) {
                path = [due.id]
            }
        }
        #endif
    }

    private func doseList(_ doses: [MedicationDose]) -> some View {
        List {
            ForEach(MedicationGroup.grouping(doses)) { group in
                Section {
                    ForEach(group.doses) { dose in
                        NavigationLink(value: dose.id) {
                            MedicationDoseRow(dose: dose, status: store.medicationStatus(for: dose))
                        }
                    }
                    let pending = group.doses.filter { store.medicationStatus(for: $0) == .pending }
                    if group.isScheduled, pending.count > 1 {
                        Button {
                            Haptics.tap()
                            for dose in pending { log(dose, .taken) }
                        } label: {
                            Text(String(localized: "watch.medications.logAll", defaultValue: "Log All as Taken"))
                                .frame(maxWidth: .infinity)
                        }
                        .tint(GoalPalette.medication)
                    }
                } header: {
                    Text(group.title)
                }
            }
        }
    }

    private func emptyState(synced: Bool) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "pills.fill")
                .watchFont(.title2, classic: .title3)
                .foregroundStyle(GoalPalette.medication)
            Text(synced
                 ? String(localized: "watch.medications.nothingToday", defaultValue: "Nothing scheduled today")
                 : String(localized: "watch.medications.notSynced", defaultValue: "Open SparkyFitness on your iPhone to see your medications"))
                .watchFont(.body, classic: .footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func log(_ dose: MedicationDose, _ action: MedicationTapAction) {
        let clientId = store.recordMedicationTap(dose, action: action)
        session.sendMedicationTap(dose, clientId: clientId, action: action)
    }
}

/// The doses that share a time, in the phone's order (soonest first, untimed
/// scheduled doses, then as-needed ones).
struct MedicationGroup: Identifiable {
    let title: String
    /// False for the as-needed group, which has nothing to log all of.
    let isScheduled: Bool
    let doses: [MedicationDose]

    var id: String { title }

    static func grouping(_ doses: [MedicationDose]) -> [MedicationGroup] {
        var groups: [MedicationGroup] = []
        for dose in doses {
            let asNeeded = dose.scheduleId.isEmpty
            let title = asNeeded
                ? String(localized: "watch.medications.asNeeded", defaultValue: "As Needed")
                : dose.time.isEmpty
                    ? String(localized: "watch.medications.anyTime", defaultValue: "Any Time")
                    : dose.time
            if let last = groups.last, last.title == title {
                groups[groups.count - 1] = MedicationGroup(title: title, isScheduled: !asNeeded, doses: last.doses + [dose])
            } else {
                groups.append(MedicationGroup(title: title, isScheduled: !asNeeded, doses: [dose]))
            }
        }
        return groups
    }
}

/// The round icon a dose wears: a pill for a medication, a leaf for a
/// supplement.
struct MedicationIcon: View {
    let dose: MedicationDose
    var size: CGFloat = 26

    var body: some View {
        Image(systemName: dose.supplement == true ? "leaf.fill" : "pills.fill")
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(GoalPalette.medication)
            .frame(width: size, height: size)
            .background(GoalPalette.medication.opacity(0.2), in: Circle())
            .accessibilityHidden(true)
    }
}

private struct MedicationDoseRow: View {
    let dose: MedicationDose
    let status: MedicationDoseStatus

    @EnvironmentObject private var store: CheckInStore

    var body: some View {
        HStack(spacing: 8) {
            MedicationIcon(dose: dose)
            VStack(alignment: .leading, spacing: 2) {
                Text(dose.name)
                    .watchFont(.headline, classic: .subheadline.weight(.medium))
                    .lineLimit(2)
                if let caption {
                    Text(caption)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            statusIcon
        }
        .padding(.vertical, 4)
        .opacity(status == .skipped ? 0.6 : 1)
        .accessibilityElement(children: .combine)
        .accessibilityValue(MedicationDoseView.statusText(status) ?? "")
    }

    /// The dose, or "Skipped" in its place once it is skipped.
    private var caption: String? {
        if status == .skipped { return MedicationDoseView.statusText(.skipped) }
        return dose.detail.isEmpty ? nil : dose.detail
    }

    @ViewBuilder
    private var statusIcon: some View {
        if status == .taken {
            // Orange until the phone has it, as on the Water page.
            let queued = store.medicationTap(for: dose.id)?.state == .queued
            Image(systemName: "checkmark.circle.fill")
                .watchFont(.title3, classic: .body)
                .foregroundStyle(queued ? Color.orange : Color.green)
        }
    }
}

/// One dose, opened from the list: what it is, and Taken / Skipped as the two
/// big buttons, as in Apple's Medications app.
struct MedicationDoseView: View {
    let dose: MedicationDose

    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let status = store.medicationStatus(for: dose)
        ScrollView {
            VStack(spacing: 6) {
                MedicationIcon(dose: dose, size: 32)
                VStack(spacing: 2) {
                    Text(dose.name)
                        .watchFont(.title3.weight(.semibold), classic: .headline)
                        .multilineTextAlignment(.center)
                    let caption = [dose.detail, dose.time].filter { !$0.isEmpty }.joined(separator: " · ")
                    if !caption.isEmpty {
                        Text(caption)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    if let text = Self.statusText(status) {
                        Text(text)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(status == .taken ? Color.green : Color.secondary)
                    }
                }

                if status != .taken {
                    Button {
                        act(.taken)
                    } label: {
                        Label(String(localized: "watch.medications.taken", defaultValue: "Taken"), systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
                // An as-needed dose has no slot to skip, and an older phone
                // would read a skip as an un-tick.
                if status != .skipped, !dose.scheduleId.isEmpty, store.context.medicationSkip == true {
                    Button {
                        act(.skipped)
                    } label: {
                        Label(String(localized: "watch.medications.skipped", defaultValue: "Skipped"), systemImage: "xmark")
                            .frame(maxWidth: .infinity)
                    }
                }
                if status != .pending {
                    Button {
                        act(.undo)
                    } label: {
                        Text(String(localized: "watch.medications.clear", defaultValue: "Clear"))
                            .frame(maxWidth: .infinity)
                    }
                    .foregroundStyle(.red)
                }
            }
        }
    }

    /// "Taken" or "Skipped" for a logged dose; nil while it is still due.
    static func statusText(_ status: MedicationDoseStatus) -> String? {
        switch status {
        case .pending: return nil
        case .taken: return String(localized: "watch.medications.statusTaken", defaultValue: "Taken")
        case .skipped: return String(localized: "watch.medications.statusSkipped", defaultValue: "Skipped")
        }
    }

    private func act(_ action: MedicationTapAction) {
        // `.click`, not `.success`: all that is certain yet is that the tap
        // registered, the same reasoning as a water tap.
        Haptics.tap()
        let clientId = store.recordMedicationTap(dose, action: action)
        session.sendMedicationTap(dose, clientId: clientId, action: action)
        dismiss()
    }
}
