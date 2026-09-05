import SwiftUI
import WatchKit

/// The Water page
///
/// A fillable bottle on the left, two-thirds of the screen's width, showing
/// progress toward today's water goal, and a scrollable column of square
/// containers configured on the server on the right, one per entry. Tapping a
/// square logs that container's full serving straight to the phone — there is
/// no local-only increment and no selection state, unlike the phone app's
/// single active-container model. Every square is always live.
struct WaterIntakeView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Taps logged locally before the phone's confirmed total has caught up
    /// to them. Each one assumes it landed; if the write actually failed, it
    /// simply expires after `pendingTimeout` and the bottle settles back down
    /// to the true total on the next context push. That settle-back is a
    /// deliberately accepted tradeoff — see `WatchSessionManager.sendWaterTap`
    /// — for making a tap feel instant instead of gating it on a phone round
    /// trip.
    @State private var pendingTaps: [PendingTap] = []

    private struct PendingTap: Identifiable {
        let id: String
        let volumeMl: Double
    }

    /// Long enough to comfortably cover one normal watch → phone → server →
    /// context-push round trip; short enough that a real failure doesn't
    /// leave the bottle looking wrong for long. Nanoseconds rather than the
    /// newer `Duration` type, which needs a newer OS than this target commits
    /// to — same deployment-target caution as the rest of this target.
    private static let pendingTimeoutNanoseconds: UInt64 = 10_000_000_000

    /// Yesterday's totals are worse than none — discarded the same way
    /// `GoalSummaryView` discards stale nutrition.
    private var water: WaterSnapshot? {
        guard let snapshot = store.context.water, snapshot.isToday else { return nil }
        return snapshot
    }

    /// Containers deliberately are NOT gated on the day, unlike `water` above.
    /// They're configuration: a container is as valid this morning as it was
    /// last night, and the wearer needs the squares most precisely when the
    /// phone is out of reach and nothing fresh has arrived.
    private var containers: [WaterContainer] { store.context.waterContainers ?? [] }

    /// Distinguishes "never synced" from "synced, and there are none" — the
    /// two need different wording, since only one of them is the wearer's to
    /// fix.
    private var hasEverSyncedContainers: Bool { store.context.waterContainers != nil }

    private var confirmedMl: Double { water?.consumedMl ?? 0 }
    private var goalMl: Double { water?.goalMl ?? 0 }
    private var pendingMl: Double { pendingTaps.reduce(0) { $0 + $1.volumeMl } }
    /// What the bottle and the label above it both show — confirmed plus
    /// whatever's still an optimistic guess. Keeping this one property is
    /// what keeps the two from ever disagreeing.
    private var effectiveMl: Double { confirmedMl + pendingMl }
    private var progress: Double {
        goalMl > 0 ? max(0, min(1, effectiveMl / goalMl)) : 0
    }

    /// "11% * 0.31L" — percent of goal, then the same amount in the app's
    /// configured display unit. Both read off `effectiveMl`/`progress`, so
    /// this tracks a tap's optimistic bump exactly as the bottle does.
    private var goalLabel: String {
        guard let water else { return "Water not synced yet" }
        let percent = Int((progress * 100).rounded())
        return "\(percent)% * \(water.formattedAmount(ml: effectiveMl))"
    }

    var body: some View {
        // Wraps the page so the log button can push WaterLogView with the
        // system's own back chevron. Each swipe page owns its own stack —
        // putting one around the whole TabView in ContentView would make a
        // push from here look like it belonged to the deck rather than to
        // this page.
        NavigationStack {
            content
        }
    }

    private var content: some View {
        GeometryReader { geo in
            // `.top`, not the default `.center`: the bottle doesn't fill the
            // full column height, so centering the label+bottle group as a
            // whole was leaving the label sitting well below the screen's
            // actual top edge instead of flush with it.
            HStack(alignment: .top, spacing: 8) {
                // Fixed at 2/3 of the available width; the container column
                // takes whatever's left rather than being given a width of
                // its own.
                VStack(spacing: 4) {
                    // Same status indicator as TrendView's summary row — a
                    // check-in's sync state, not anything about the taps
                    // below, but it's the one "are we caught up with the
                    // phone" signal the watch has, and every page should
                    // read it the same way rather than the Water page being
                    // the one place it's missing.
                    HStack(spacing: 4) {
                        SyncStatusIcon()
                        Text(goalLabel)
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    }
                    bottle
                }
                .frame(width: geo.size.width * 2 / 3)
                containerList
            }
        }
        // No `.ignoresSafeArea` here (tried it — sat above the clock and let
        // the container list scroll its squares up underneath it). Leaving
        // the safe area alone means both columns stop at the same boundary:
        // `alignment: .top` above already pins the label to the top of that
        // boundary, right under the clock, and the container list's
        // ScrollView can't scroll content past its own top edge into the
        // clock's space because that edge is the same boundary.
        .padding(.horizontal, 4)
        // The phone only re-pushes context with a changed water total once it
        // has actually written a tap (or water was logged on the phone
        // itself) — either way the server-side truth has moved, so whatever
        // is still pending is now redundant.
        // Single-parameter form, not the newer two-parameter one — same
        // deployment-target caution as the rest of this target.
        .onChange(of: confirmedMl) { _ in
            pendingTaps.removeAll()
        }
    }

    // MARK: - Container list

    @ViewBuilder
    private var containerList: some View {
        if !containers.isEmpty {
            // Measured explicitly rather than via `.aspectRatio` on each
            // square: inside a ScrollView the vertical proposal is
            // effectively unbounded, which is exactly the dimension
            // `.aspectRatio(1, contentMode: .fit)` needs bounded to size off
            // of — it was sizing to content height instead of the column's
            // width. Reading the column's width here and handing every
            // square that exact side length sidesteps the ambiguity.
            GeometryReader { geo in
                ScrollView {
                    VStack(spacing: 6) {
                        ForEach(containers) { container in
                            containerSquare(container, side: geo.size.width)
                        }
                        logButton(side: geo.size.width)
                    }
                }
            }
        } else {
            VStack(spacing: 4) {
                Image(systemName: "drop")
                    .font(.system(size: 20))
                    .foregroundStyle(.secondary)
                Text(hasEverSyncedContainers
                     ? "No containers set up on the server yet"
                     : "Open SparkyFitness on your phone to sync your containers")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// Last square in the column: opens today's log rather than logging
    /// anything. Deliberately the same shape and size as a container square —
    /// it belongs to that column — but neutral-toned rather than water-blue,
    /// so a glance doesn't mistake it for a fourth thing to drink.
    private func logButton(side: CGFloat) -> some View {
        NavigationLink {
            WaterLogView()
        } label: {
            VStack(spacing: 2) {
                Image(systemName: "list.bullet")
                    .font(.system(size: 15))
                    .foregroundStyle(.secondary)
                Text("Log")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .frame(width: side, height: side)
            .background(Color.secondary.opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Today's logged drinks")
    }

    private func containerSquare(_ container: WaterContainer, side: CGFloat) -> some View {
        Button {
            tap(container)
        } label: {
            VStack(spacing: 2) {
                Image(systemName: "drop.fill")
                    .font(.system(size: 15))
                    .foregroundStyle(GoalPalette.water)
                Text(container.name)
                    .font(.system(size: 11, weight: .medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                Text(container.displayVolume)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }
            // Explicit width AND height, both equal to `side` — a true
            // square regardless of how little space the content itself needs.
            .frame(width: side, height: side)
            .background(GoalPalette.water.opacity(0.16), in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Log \(container.name), \(container.displayVolume)")
    }

    private func tap(_ container: WaterContainer) {
        // `.click`, not `.success`: this fires the instant the square is
        // pressed, when all that's certain is that the tap registered. The
        // write still has to reach the phone and the server, and `.success`
        // is watchOS's "that completed" pattern — promising it here would be
        // a lie on any tap that later fails and settles back out of the
        // bottle.
        WKInterfaceDevice.current().play(.click)

        let id = UUID().uuidString
        pendingTaps.append(PendingTap(id: id, volumeMl: container.servingVolumeMl))
        session.sendWaterTap(containerId: container.id)

        Task {
            try? await Task.sleep(nanoseconds: Self.pendingTimeoutNanoseconds)
            pendingTaps.removeAll { $0.id == id }
        }
    }

    // MARK: - Bottle

    private var bottle: some View {
        GeometryReader { geo in
            ZStack {
                BottleShape()
                    .fill(Color.secondary.opacity(0.15))
                BottleShape()
                    .fill(GoalPalette.water)
                    // Plain `.mask(_:)` (centers by default) rather than the
                    // alignment-taking overload, which needs a newer OS than
                    // this target commits to — bottom-aligned by wrapping the
                    // fill rectangle in a Spacer-padded VStack instead.
                    .mask(
                        VStack(spacing: 0) {
                            Spacer(minLength: 0)
                            Rectangle().frame(height: geo.size.height * progress)
                        }
                    )
                    .animation(.easeOut(duration: 0.5), value: progress)
                BottleShape()
                    .stroke(Color.secondary.opacity(0.6), lineWidth: 1.5)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        // Wider than BottleShape's own 70:130 design space, which left the
        // bottle height-bound and a good 20pt short of its column: at 70:130
        // the fit resolved against the available height and simply didn't use
        // the width it had. At 100:130 the width becomes the binding
        // constraint instead, so the bottle fills the column. BottleShape
        // stretches to whatever rect it's handed, so this widens the
        // silhouette rather than cropping it — nudge the numerator to taste.
        // Must stay in step with BottleShape's design space below (70×130).
        // The shape maps that fixed space onto whatever rect it's handed, so
        // a mismatched ratio here doesn't resize the bottle — it stretches
        // the artwork. Widening the bottle means redrawing the path, not
        // changing this number.
        .aspectRatio(70.0 / 130.0, contentMode: .fit)
        // Decorative: `goalLabel` above already says the same thing in words,
        // so a screen reader would otherwise announce the same percentage
        // twice.
        .accessibilityHidden(true)
    }
}

/// Traces the same bottle silhouette as the phone app's Skia-drawn gauge
/// (`HydrationGauge.tsx`), scaled from its 70×130 canvas to whatever rect
/// SwiftUI hands it — kept as a shape (rather than an image asset) so the
/// fill mask above can clip to it exactly.
private struct BottleShape: Shape {
    func path(in rect: CGRect) -> Path {
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: rect.minX + x / 70 * rect.width, y: rect.minY + y / 130 * rect.height)
        }

        var path = Path()
        path.move(to: pt(26, 6))
        path.addLine(to: pt(26, 23))
        path.addLine(to: pt(23, 23))
        path.addLine(to: pt(23, 28))
        path.addCurve(to: pt(12, 42), control1: pt(23, 34), control2: pt(12, 37))
        path.addLine(to: pt(12, 112))
        path.addCurve(to: pt(35, 124), control1: pt(12, 121), control2: pt(20, 124))
        path.addCurve(to: pt(58, 112), control1: pt(50, 124), control2: pt(58, 121))
        path.addLine(to: pt(58, 42))
        path.addCurve(to: pt(47, 28), control1: pt(58, 37), control2: pt(47, 34))
        path.addLine(to: pt(47, 23))
        path.addLine(to: pt(44, 23))
        path.addLine(to: pt(44, 6))
        path.closeSubpath()
        return path
    }
}
