import SwiftUI

/// Today's individual logged drinks, pushed here from the Water page's list
/// button. Read-and-delete only: there is no way to add a drink from this
/// screen, because the container squares one back-tap away already do that
/// better than any control this list could offer.
///
/// Reached by a NavigationStack push rather than being another page in the
/// swipe deck — it's a detail of the Water page, not a peer of it, and the
/// push gets watchOS's standard back chevron for free.
struct WaterLogView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// The row awaiting a yes/no answer. Non-nil means the confirmation is up.
    @State private var pendingDeletion: WaterLogEntry?

    /// Rows whose delete the phone has confirmed — gone, pending only the
    /// push that drops them from the log itself.
    private var deletedIds: Set<String> { store.deletedWaterEntryIds }

    /// Rows the wearer has confirmed but the phone hasn't written yet. Drawn
    /// dimmed rather than hidden: the same honesty the bottle's queued line
    /// buys on the Water page — you can see what hasn't synced instead of a
    /// finished state that may reverse.
    private var deletingIds: Set<String> { store.deletingWaterEntryIds }

    private var water: WaterSnapshot? {
        guard let snapshot = store.context.water, snapshot.isToday else { return nil }
        return snapshot
    }

    /// Newest first — already ordered by the phone; this only filters out what
    /// has been optimistically removed.
    private var entries: [WaterLogEntry] {
        (water?.log ?? []).filter { !deletedIds.contains($0.id) }
    }

    var body: some View {
        Group {
            if entries.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(entries) { entry in
                        row(entry)
                    }
                }
            }
        }
        .navigationTitle(String(localized: "watch.water.today", defaultValue: "Today"))
        // Inline, so the title sits on the same line as the back chevron
        // rather than eating a whole row of a screen this small.
        .navigationBarTitleDisplayMode(.inline)
        // A sheet rather than `.confirmationDialog`: on watchOS the dialog's
        // buttons stack full-width with a Cancel that reads as a third
        // option, and Adam asked for a plain two-button yes/no.
        .sheet(item: $pendingDeletion) { entry in
            confirmation(for: entry)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "drop")
                .watchFont(.title2, classic: .system(size: 22))
                .foregroundStyle(.secondary)
            Text(String(localized: "watch.water.empty", defaultValue: "Nothing logged yet today"))
                .watchFont(.body, classic: .system(size: 12))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func row(_ entry: WaterLogEntry) -> some View {
        let isDeleting = deletingIds.contains(entry.id)
        return Button {
            // Tapping again while one is already in flight would queue a second
            // delete for the same row, which the phone would then report as a
            // failure against a row that is legitimately gone.
            guard !isDeleting else { return }
            Haptics.tap()
            pendingDeletion = entry
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(entry.name)
                    .watchFont(.headline, classic: .system(size: 14, weight: .bold))
                    .lineLimit(2)
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(amountText(entry))
                        .watchFont(.body.weight(.medium), classic: .system(size: 13, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(GoalPalette.water)
                    Text(entry.time)
                        .watchFont(.footnote, classic: .system(size: 10))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .opacity(isDeleting ? 0.4 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "watch.water.entryAccessibility", defaultValue: "\(entry.name), \(amountText(entry)), at \(entry.time)"))
        .accessibilityHint(
            isDeleting
                ? String(localized: "watch.water.deletingHint", defaultValue: "Deleting, waiting for your phone")
                : String(localized: "watch.water.deleteHint", defaultValue: "Opens a prompt to delete this entry")
        )
    }

    /// Formatted in the account's configured water unit, the same way the
    /// bottle's label and the container squares are.
    private func amountText(_ entry: WaterLogEntry) -> String {
        store.context.formattedWater(ml: entry.volumeMl)
    }

    private func confirmation(for entry: WaterLogEntry) -> some View {
        VStack(spacing: 10) {
            Text(String(localized: "watch.water.deleteEntryConfirm", defaultValue: "Delete this entry?"))
                .watchFont(.headline, classic: .system(size: 15, weight: .semibold))
                .multilineTextAlignment(.center)
            Text("\(entry.name) · \(amountText(entry))")
                .watchFont(.footnote, classic: .system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            HStack(spacing: 8) {
                Button(String(localized: "watch.common.no", defaultValue: "No")) {
                    Haptics.tap()
                    pendingDeletion = nil
                }
                .buttonStyle(.bordered)

                Button(String(localized: "watch.common.yes", defaultValue: "Yes")) {
                    Haptics.tap()
                    delete(entry)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
        }
        .padding(.horizontal, 6)
    }

    private func delete(_ entry: WaterLogEntry) {
        // One id, recorded before it is sent, so the phone's acknowledgement
        // has something on this side to settle — and so a delete that never
        // reaches the phone is resent rather than quietly undoing itself.
        let clientId = store.recordWaterDelete(entryId: entry.id)
        session.sendWaterDelete(entryId: entry.id, clientId: clientId)
        pendingDeletion = nil
    }
}
