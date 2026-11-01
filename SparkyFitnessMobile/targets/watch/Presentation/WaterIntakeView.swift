import SwiftUI
import WatchKit

/// The Water page
///
/// A fillable bottle beside today's total and goal, then one full-width row
/// per container configured on the server. Tapping a row logs that container's full serving straight to the phone — there is
/// no local-only increment and no selection state, unlike the phone app's
/// single active-container model. Every row is always live.
struct WaterIntakeView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Yesterday's totals are worse than none — discarded the same way
    /// `GoalSummaryView` discards stale nutrition.
    private var water: WaterSnapshot? {
        guard let snapshot = store.context.water, snapshot.isToday else { return nil }
        return snapshot
    }

    /// Containers deliberately are NOT gated on the day, unlike `water` above.
    /// They're configuration: a container is as valid this morning as it was
    /// last night, and the wearer needs the rows most precisely when the
    /// phone is out of reach and nothing fresh has arrived.
    private var containers: [WaterContainer] { store.context.waterContainers ?? [] }

    /// Distinguishes "never synced" from "synced, and there are none" — the
    /// two need different wording, since only one of them is the wearer's to
    /// fix.
    private var hasEverSyncedContainers: Bool { store.context.waterContainers != nil }

    private var confirmedMl: Double { water?.consumedMl ?? 0 }
    /// The goal comes from the context, not the day's snapshot — so a morning
    /// the phone hasn't spoken to still has a scale to draw a tap against.
    /// This is the whole reason a first-thing-in-the-morning tap used to leave
    /// the bottle empty: with the goal inside the snapshot, there wasn't one.
    private var goalMl: Double { store.context.waterGoalMl ?? 0 }
    /// Written to the server but not yet in a pushed total — part of the fill.
    private var savedMl: Double { store.savedWaterMl }
    /// Still waiting on the phone — drawn as the line above the fill, not as
    /// fill, so the gap is exactly what hasn't synced.
    private var queuedMl: Double { store.queuedWaterMl }
    /// What the bottle and the label above it both show — confirmed plus
    /// whatever's still an optimistic guess. Keeping this one property is
    /// what keeps the two from ever disagreeing.
    /// Everything the server either has or has told us it has.
    private var effectiveMl: Double { confirmedMl + savedMl }
    /// Where the bottle would stand once the queued taps land.
    private var targetMl: Double { effectiveMl + queuedMl }

    private var progress: Double { fraction(of: effectiveMl) }
    /// Nil when nothing is queued, which is also when no line is drawn.
    private var queuedProgress: Double? {
        guard queuedMl > 0, goalMl > 0 else { return nil }
        return fraction(of: targetMl)
    }

    private func fraction(of ml: Double) -> Double {
        goalMl > 0 ? max(0, min(1, ml / goalMl)) : 0
    }

    /// "60% of 2.5 L", under the total. Reads off `progress`, so it tracks a
    /// tap's optimistic bump exactly as the bottle does, and the confirmed
    /// level rather than the queued one: the line above the fill is what says
    /// "more is coming".
    private var goalLabel: String {
        guard goalMl > 0 else {
            return String(localized: "watch.water.notSynced", defaultValue: "Water not synced yet")
        }
        let percent = Int((progress * 100).rounded())
        return String(localized: "watch.water.ofGoal", defaultValue: "\(percent)% of \(store.context.formattedWater(ml: goalMl))")
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
        ScrollView {
            VStack(spacing: 6) {
                summary
                containerList
            }
            .padding(.horizontal, 4)
        }
    }

    /// The bottle beside today's total in large type and the goal under it.
    /// Kept to one row so the containers, the thing to tap, start on the
    /// first screen.
    private var summary: some View {
        HStack(alignment: .center, spacing: 10) {
            bottle
                .frame(height: WatchStyle.s(84))
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    // The total stands on its own: a missing goal only blanks
                    // the "% of goal" line under it.
                    Text(water == nil && effectiveMl == 0 ? "–" : store.context.formattedWater(ml: effectiveMl))
                        .font(.system(size: WatchStyle.s(28), weight: .semibold, design: .rounded))
                        .foregroundStyle(GoalPalette.water)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    // Only while a tap is outstanding: the one "are we caught
                    // up with the phone" signal, scoped to this page's taps.
                    if store.waterSyncState != .saved {
                        SyncStatusIcon(
                            state: store.waterSyncState,
                            onRetry: { session.retryFailedWaterTaps() }
                        )
                    }
                }
                Text(goalLabel)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .lineLimit(2)
                // Only when there is some to show. A zero is the phone's
                // "setting on, nothing logged" state, and the phone's own
                // card hides that line.
                if let fromFood = water?.fromFoodMl, fromFood > 0 {
                    Text(String(localized: "watch.water.includesFood", defaultValue: "Includes \(store.context.formattedWater(ml: fromFood)) from food"))
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Container list

    @ViewBuilder
    private var containerList: some View {
        if !containers.isEmpty {
            ForEach(containers) { container in
                containerRow(container)
            }
            logButton
        } else {
            Text(hasEverSyncedContainers
                 ? String(localized: "watch.water.noContainers", defaultValue: "No containers set up on the server yet")
                 : String(localized: "watch.water.openPhone", defaultValue: "Open SparkyFitness on your iPhone to sync your containers"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
    }

    /// Last row: opens today's log rather than logging anything. Neutral-toned
    /// rather than water-blue, so a glance doesn't mistake it for another
    /// thing to drink.
    private var logButton: some View {
        NavigationLink {
            WaterLogView()
        } label: {
            Label(String(localized: "watch.water.todayLog", defaultValue: "Today's Log"), systemImage: "list.bullet")
                .font(.body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color.secondary.opacity(0.16), in: WatchStyle.shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "watch.water.loggedDrinks", defaultValue: "Today's logged drinks"))
    }

    /// One container, full width: its name, and its serving on the right.
    /// A tap logs that serving.
    private func containerRow(_ container: WaterContainer) -> some View {
        Button {
            tap(container)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "drop.fill")
                    .font(.body)
                    .foregroundStyle(GoalPalette.water)
                Text(container.name)
                    .font(.headline)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(container.displayVolume)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
                    .fixedSize()
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .background(GoalPalette.water.opacity(0.16), in: WatchStyle.shape)
            .contentShape(WatchStyle.shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "watch.water.logContainer", defaultValue: "Log \(container.name), \(container.displayVolume)"))
    }

    private func tap(_ container: WaterContainer) {
        // `.click`, not `.success`: this fires the instant the row is
        // pressed, when all that's certain is that the tap registered. The
        // write still has to reach the phone and the server, and `.success`
        // is watchOS's "that completed" pattern — promising it here would be
        // a lie on any tap that later fails and settles back out of the
        // bottle.
        Haptics.tap()

        // No timeout to un-do this: the tap stands until the phone sends a
        // total for today that accounts for it. A ten-second expiry looked
        // honest when the phone was in the room and was simply wrong when it
        // wasn't — which is exactly when the wearer is drinking.
        // One id, generated by the store and carried to the phone, so the
        // acknowledgement that comes back can be matched to this exact tap.
        let clientId = store.recordWaterTap(
            volumeMl: container.servingVolumeMl,
            containerId: container.id
        )
        session.sendWaterTap(containerId: container.id, clientId: clientId)
    }

    // MARK: - Bottle

    /// Where the water will stand once the queued taps are written.
    ///
    /// A line rather than more fill, deliberately: filling it would claim the
    /// water is logged, and the whole point is that it isn't yet. The gap
    /// between the fill and this line is the amount in flight.
    ///
    /// Clipped to the bottle so it stops at the silhouette's edges instead of
    /// running the full width of the frame, and drawn under the outline below
    /// so the two don't fight where they meet.
    private func queuedLine(in geo: GeometryProxy, at fraction: Double) -> some View {
        BottleShape()
            .fill(GoalPalette.water)
            .mask(
                VStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Rectangle().frame(height: Self.queuedLineWidth)
                        .padding(.bottom, max(0, geo.size.height * fraction - Self.queuedLineWidth))
                }
            )
            .animation(.easeOut(duration: 0.5), value: fraction)
    }

    private static let queuedLineWidth: CGFloat = 2

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
                if let queuedProgress {
                    queuedLine(in: geo, at: queuedProgress)
                }
                BottleShape()
                    .stroke(Color.secondary.opacity(0.6), lineWidth: 1.5)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        // Must stay in step with BottleShape's design space below (70×130).
        // The shape maps that fixed space onto whatever rect it's handed, so
        // a mismatched ratio here doesn't resize the bottle — it stretches
        // the artwork. Widening the bottle means redrawing the path, not
        // changing this number.
        .aspectRatio(70.0 / 130.0, contentMode: .fit)
        // Flexible so the VStack gives the bottle whatever height is left
        // under the labels. A width-driven 70:130 bottle is taller than a
        // 40 mm screen once the food-water line is in the stack, and `.fit`
        // only shrinks it when the proposed height is bounded.
        .frame(maxHeight: .infinity, alignment: .top)
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
