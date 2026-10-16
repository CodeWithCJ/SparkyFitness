import SwiftUI
import WatchKit

/// The Medications page.
///
/// Today's scheduled doses as a scrollable column of rows in the Water page's
/// tile style: a tinted rounded square per dose, name and dose on the left, the
/// time under it, and a tick on the right. Tapping a pending dose logs it as
/// taken straight to the phone — there is no local-only state. Tapping a taken
/// dose un-ticks it (a mistaken tap), which deletes the entry on the phone.
/// Skipping a dose stays on the phone.
struct MedicationsView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Yesterday's doses are worse than none — discarded the same way
    /// `GoalSummaryView` discards stale nutrition.
    private var snapshot: MedicationSnapshot? {
        guard let snapshot = store.context.medications, snapshot.isToday else { return nil }
        return snapshot
    }

    var body: some View {
        VStack(spacing: 4) {
            // Same status pill as the Water page, scoped to this page's own
            // ticks so a red dot here is always about a dose.
            HStack(spacing: 4) {
                SyncStatusIcon(
                    state: store.medicationSyncState,
                    onRetry: { session.retryFailedMedicationTaps() }
                )
                Text(headerLabel)
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            content
        }
        .padding(.horizontal, 4)
    }

    /// "2 of 3 taken", or the reason there is nothing to count.
    private var headerLabel: String {
        guard let snapshot else { return "Medications not synced yet" }
        guard !snapshot.doses.isEmpty else { return "Medications" }
        let taken = snapshot.doses.filter(isTaken).count
        return "\(taken) of \(snapshot.doses.count) taken"
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot, !snapshot.doses.isEmpty {
            ScrollView {
                VStack(spacing: 6) {
                    ForEach(snapshot.doses) { dose in
                        doseRow(dose)
                    }
                }
            }
        } else {
            VStack(spacing: 4) {
                Image(systemName: "pills")
                    .font(.system(size: 20))
                    .foregroundStyle(.secondary)
                Text(snapshot == nil
                     ? "Open SparkyFitness on your phone to sync your medications"
                     : "Nothing scheduled today")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Taken on the phone's say-so, or ticked here and not failed since. A
    /// failed tick reads as not taken, so the row is tappable again.
    private func isTaken(_ dose: MedicationDose) -> Bool {
        if let tap = store.medicationTap(for: dose.id) { return !tap.isUndo }
        return dose.status == .taken
    }

    private func tickColor(for dose: MedicationDose) -> Color {
        guard let tap = store.medicationTap(for: dose.id) else { return .green }
        return tap.state == .queued ? .orange : .green
    }

    private func doseRow(_ dose: MedicationDose) -> some View {
        let taken = isTaken(dose)
        return Button {
            tap(dose)
        } label: {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(dose.name)
                        .font(.system(size: 12, weight: .medium))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    let captionText = caption(for: dose)
                    if !captionText.isEmpty {
                        Text(captionText)
                            .font(.system(size: 9))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: taken ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 18))
                    .foregroundStyle(taken ? tickColor(for: dose) : GoalPalette.medication)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                GoalPalette.medication.opacity(taken ? 0.08 : 0.16),
                in: RoundedRectangle(cornerRadius: 16)
            )
            .opacity(dose.status == .skipped && !taken ? 0.6 : 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: dose, taken: taken))
    }

    /// "8:00 AM · 10 mg", with whichever half the phone sent.
    private func caption(for dose: MedicationDose) -> String {
        var parts = [dose.time, dose.detail].filter { !$0.isEmpty }
        if dose.status == .skipped { parts.append("Skipped") }
        return parts.joined(separator: " · ")
    }

    private func accessibilityLabel(for dose: MedicationDose, taken: Bool) -> String {
        let base = [dose.name, dose.detail, dose.time].filter { !$0.isEmpty }.joined(separator: ", ")
        return taken ? "\(base), taken. Tap to unmark" : "Mark \(base) as taken"
    }

    private func tap(_ dose: MedicationDose) {
        // `.click`, not `.success`: all that is certain yet is that the tap
        // registered, the same reasoning as a water tap.
        WKInterfaceDevice.current().play(.click)
        let undo = isTaken(dose)
        let clientId = store.recordMedicationTap(dose, undo: undo)
        session.sendMedicationTap(dose, clientId: clientId, undo: undo)
    }
}
