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

    /// Rows the wearer has confirmed deleting, hidden immediately rather than
    /// waiting for the phone to write and push back — same optimistic
    /// treatment a tap gets on the Water page. If a delete fails, the phone
    /// re-pushes and the row reappears (see `handleWaterDelete` there).
    @State private var deletedIds: Set<String> = []

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
        .navigationTitle("Today")
        // Inline, so the title sits on the same line as the back chevron
        // rather than eating a whole row of a screen this small.
        .navigationBarTitleDisplayMode(.inline)
        // A sheet rather than `.confirmationDialog`: on watchOS the dialog's
        // buttons stack full-width with a Cancel that reads as a third
        // option, and Adam asked for a plain two-button yes/no.
        .sheet(item: $pendingDeletion) { entry in
            confirmation(for: entry)
        }
        // Whenever the phone pushes a new log, that list is the authority and
        // the optimistic hiding has done its job. Clearing here is what makes
        // a FAILED delete self-correct: the phone re-pushes the unchanged log,
        // this drops the id, and the row comes back rather than staying
        // invisible on a screen that no longer matches the server.
        // Single-parameter form, per this target's deployment-target caution.
        .onChange(of: water?.log ?? []) { _ in
            deletedIds.removeAll()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 6) {
            Image(systemName: "drop")
                .font(.system(size: 22))
                .foregroundStyle(.secondary)
            Text("Nothing logged yet today")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func row(_ entry: WaterLogEntry) -> some View {
        Button {
            pendingDeletion = entry
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(entry.name)
                    .font(.system(size: 14, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                VStack(alignment: .trailing, spacing: 1) {
                    Text(amountText(entry))
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .monospacedDigit()
                        .foregroundStyle(GoalPalette.water)
                    Text(entry.time)
                        .font(.system(size: 10))
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(entry.name), \(amountText(entry)), at \(entry.time)")
        .accessibilityHint("Opens a prompt to delete this entry")
    }

    /// Formatted in the account's configured water unit, the same way the
    /// bottle's label and the container squares are.
    private func amountText(_ entry: WaterLogEntry) -> String {
        water?.formattedAmount(ml: entry.volumeMl) ?? "\(Int(entry.volumeMl))ml"
    }

    private func confirmation(for entry: WaterLogEntry) -> some View {
        VStack(spacing: 10) {
            Text("Delete this entry?")
                .font(.system(size: 15, weight: .semibold))
                .multilineTextAlignment(.center)
            Text("\(entry.name) · \(amountText(entry))")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            HStack(spacing: 8) {
                Button("No") {
                    pendingDeletion = nil
                }
                .buttonStyle(.bordered)

                Button("Yes") {
                    delete(entry)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
            }
        }
        .padding(.horizontal, 6)
    }

    private func delete(_ entry: WaterLogEntry) {
        deletedIds.insert(entry.id)
        session.sendWaterDelete(entryId: entry.id)
        pendingDeletion = nil
    }
}
