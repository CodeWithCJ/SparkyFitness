import SwiftUI

/// Router for the watch app. First run is a one-time gate; after that, Entry,
/// Goals and Trend are pages the wearer swipes between — swiping is the only
/// way to move between them, there is no button.
struct ContentView: View {
    /// Goals sits in the middle so it is one swipe from either neighbour.
    /// Declaration order here is also the swipe order.
    private enum Page: Int { case entry, goals, trend }

    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

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
                TabView(selection: Binding(get: { page ?? initialPage }, set: { page = $0 })) {
                    GoalSummaryView()
                      .tag(Page.goals)
                  
                    CheckInEntryView { page = .trend }
                        .tag(Page.entry)

                    TrendView()
                        .tag(Page.trend)
                }
                .tabViewStyle(.page(indexDisplayMode: .automatic))
            }
        }
        .onAppear {
            session.requestContext()
            session.retryPending()
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
            // TODO(water): once the water page exists, add `case water` to
            // `Page`, add the view to the TabView above with `.tag(Page.water)`,
            // and return `.water` here. Those three edits are the whole wiring
            // — the scheme, the widget-side link and the parsing are already
            // done.
            return nil
        }
    }

    /// Landing page on a normal (non-first-run) launch: Trend if today is
    /// already logged — nothing left to capture — otherwise Entry.
    private var initialPage: Page {
        store.isReplacingToday ? .trend : .entry
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
