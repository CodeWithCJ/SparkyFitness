import SwiftUI

/// Router for the watch app. First run is a one-time gate; after that, Goals,
/// Water, Entry and Trend are pages the wearer swipes between — swiping is
/// the only way to move between them, there is no button.
struct ContentView: View {
    /// Identifies a page; the cases are `.tag` values, nothing more.
    ///
    /// Swipe order is set by the order the views appear in the `TabView`
    /// below, NOT by the order of these cases — a `.page`-style TabView lays
    /// its children out in body order. Reordering this enum alone changes
    /// nothing on screen, so change both together or neither.
    private enum Page: Int { case goals, water, entry, trend }

    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Watched so the app can notice a day has ended while it was away. The
    /// watch app commonly stays resident overnight, in which case nothing
    /// else would prompt it to re-check — `onAppear` doesn't fire again on a
    /// return to an app that never went away.
    @Environment(\.scenePhase) private var scenePhase

    /// Latches true the moment first-run completes this session, so a
    /// mid-session context update from the phone can't flicker the gate back
    /// on. `page` follows the same "nil until something explicit happens"
    /// pattern so a fresh launch still lands on the right page.
    @State private var didFirstRun = false
    @State private var page: Page?

    var body: some View {
        Group {
            if !didFirstRun && store.needsFirstRunEntry {
                FirstRunEntryView { weight, bodyFat in
                    let checkIn = store.capture(weightKg: weight, bodyFatPercentage: bodyFat)
                    store.markState(session.send(checkIn), for: checkIn)
                    didFirstRun = true
                    page = .trend
                }
            } else {
                // This order is the swipe order: Goals ▸ Water ▸ Entry ▸ Trend.
                TabView(selection: Binding(get: { page ?? initialPage }, set: { page = $0 })) {
                    GoalSummaryView()
                        .tag(Page.goals)

                    WaterIntakeView()
                        .tag(Page.water)

                    CheckInEntryView { page = .trend }
                        .tag(Page.entry)

                    TrendView()
                        .tag(Page.trend)
                }
                .tabViewStyle(.page(indexDisplayMode: .automatic))
            }
        }
        .onAppear {
            store.pruneStaleDayData()
            // Cheap, local, and works with the phone out of range — unlike
            // `requestContext()` below, which needs it reachable right now.
            session.adoptReceivedContext()
            session.requestContext()
            session.retryPending()
            // Publish what the watch already knows before waiting on the
            // phone: `requestContext()` above only reaches a phone that's
            // reachable right now, and until it answers the complications
            // would otherwise have nothing to draw from — even though the
            // app's own pages are happily showing the persisted context.
            session.refreshComplications()
        }
        // The case `onAppear` misses: the app was never torn down, just put
        // away for the night, so the only signal that a new day started is
        // coming back to the foreground.
        // Single-parameter form, per this target's deployment-target caution.
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            store.pruneStaleDayData()
            // Cheap, local, and works with the phone out of range — unlike
            // `requestContext()` below, which needs it reachable right now.
            session.adoptReceivedContext()
            session.requestContext()
            session.refreshComplications()
        }
        .onOpenURL { url in
            guard let link = WatchDeepLink(url: url),
                  let requested = destination(for: link)
            else { return }
            // Deliberately does not touch `didFirstRun`: if there is no seed
            // weight yet, that one-time entry is still owed, and the requested
            // page is simply waiting behind it rather than being skipped.
            page = requested
        }
    }

    /// Which page a complication tap lands on. Nil for a destination this build
    /// has no page for, so an early link does nothing instead of jumping
    /// somewhere wrong.
    private func destination(for link: WatchDeepLink) -> Page? {
        switch link {
        case .goals:
            return .goals
        case .water:
            return .water
        }
    }

    /// Landing page on a normal (non-first-run) launch: Trend if today is
    /// already logged — nothing left to capture — otherwise Entry.
    private var initialPage: Page {
        store.isReplacingToday ? .goals : .entry
    }
}

/// One-time screen used when there is no seed value. From the second entry
/// onwards it is the Digital Crown forever.
struct FirstRunEntryView: View {
    /// Always kg, regardless of `unit` below — same contract as everywhere
    /// else that hands a weight to `CheckInStore`.
    let onSave: (Double, Double?) -> Void

    @EnvironmentObject private var store: CheckInStore
    @State private var weightText = ""
    @State private var bodyFatText = ""

    /// Mirrors the phone's Settings → default weight unit, same as the crown
    /// screen and trend chart. Available here as long as the watch has synced
    /// with the phone at least once, which first-run entry doesn't require —
    /// falls back to kg otherwise.
    private var unit: WeightUnit { store.context.effectiveWeightUnit }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("First check-in")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Type today's numbers once — after this the Digital Crown starts from your last value.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                TextField("Weight \(unit.suffix)", text: $weightText)
                TextField("Body fat % (optional)", text: $bodyFatText)

                Button("Save") {
                    guard let weight = parse(weightText) else { return }
                    onSave(unit.toKg(weight), parse(bodyFatText))
                }
                .buttonStyle(.borderedProminent)
                .disabled(parse(weightText) == nil)
            }
            .padding(.horizontal, 4)
        }
    }

    private func parse(_ value: String) -> Double? {
        Double(value.replacingOccurrences(of: ",", with: "."))
    }
}
