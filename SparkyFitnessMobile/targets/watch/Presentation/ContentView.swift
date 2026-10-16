import SwiftUI

/// Router for the watch app. First run is a one-time gate; after that, Goals,
/// Water, Entry, Trend and Workout are pages the wearer swipes between —
/// swiping is the only way to move between them, there is no button. Which of
/// them show, and in what order, is the phone's Settings → Apple Watch choice
/// (`WatchContext.visiblePages`).
struct ContentView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var workout: WorkoutSessionStore
    @EnvironmentObject private var recording: RecordingStore
    @EnvironmentObject private var run: WatchRunStore

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
    @State private var page: WatchPage?

    /// The pages in swipe order, as the phone last arranged them.
    private var pages: [WatchPage] {
        // A wrist-only run and the phone's GPS recording both live on the
        // Workout page, so they keep that page showing (and Now Playing
        // beside it) just as a strength workout does.
        store.context.visiblePages(
            workoutActive: workout.isActive || run.isActive || recording.isActive
        )
    }

    var body: some View {
        Group {
            if !didFirstRun && store.needsFirstRunEntry {
                FirstRunEntryView { weight, bodyFat in
                    let checkIn = store.capture(weightKg: weight, bodyFatPercentage: bodyFat)
                    store.markState(session.send(checkIn), for: checkIn)
                    didFirstRun = true
                    page = shown(.trend)
                }
            } else {
                // A `.page`-style TabView lays its children out in body order,
                // so the order of `pages` is the swipe order.
                TabView(selection: Binding(get: { selectedPage }, set: { page = $0 })) {
                    ForEach(pages, id: \.self) { page in
                        view(for: page)
                            .tag(page)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .automatic))
                // Rebuilt, not diffed, when the phone reorders or hides pages.
                // A page-style TabView keeps its own index of the selected
                // child; moving the child under it (reordering Water while it
                // is on screen) left that index pointing past the new layout
                // and crashed the app.
                .id(pages)
            }
        }
        .onAppear {
            store.pruneStaleDayData()
            // Cheap, local, and works with the phone out of range — unlike
            // `requestContext()` below, which needs it reachable right now.
            session.adoptReceivedContext()
            session.requestContext()
            session.retryPending()
            session.resendQueuedWaterTaps()
            session.resendQueuedWaterDeletes()
            session.resendQueuedMedicationTaps()
            // Publish what the watch already knows before waiting on the
            // phone: `requestContext()` above only reaches a phone that's
            // reachable right now, and until it answers the complications
            // would otherwise have nothing to draw from — even though the
            // app's own pages are happily showing the persisted context.
            session.refreshComplications()

            #if DEBUG
            // Last, so nothing above re-applies an empty phone context over
            // the seeded one. Only ever active with the CI screenshot job's
            // launch environment set — see ScreenshotSeed.
            if ScreenshotSeed.isEnabled {
                ScreenshotSeed.apply()
                didFirstRun = true
                // The CI job names pages by their raw value; an unknown name
                // leaves the normal landing logic be.
                if let name = ScreenshotSeed.requestedPage,
                   let requested = WatchPage(rawValue: name) {
                    page = requested
                }
            }
            #endif
        }
        // The case `onAppear` misses: the app was never torn down, just put
        // away for the night, so the only signal that a new day started is
        // coming back to the foreground.
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            store.pruneStaleDayData()
            // Cheap, local, and works with the phone out of range — unlike
            // `requestContext()` below, which needs it reachable right now.
            session.adoptReceivedContext()
            session.requestContext()
            session.refreshComplications()
            // Coming back to the app mid-workout lands on the workout, not
            // whichever page was left open.
            if workout.isActive || run.isActive || recording.isActive { page = .workout }
        }
        // A workout started on the phone opens the watch app; land on the
        // workout rather than whichever page was showing last. Keyed on the
        // session id, so it happens once per workout and the wearer can still
        // swipe away mid-workout without being pulled back.
        .onChange(of: workout.plan?.sessionId) { _, sessionId in
            if sessionId != nil { page = .workout }
        }
        // A recording that starts (or is picked up after the app was away)
        // opens the Workout page, where it shows, once per recording; swiping
        // away is respected.
        .onChange(of: recording.state?.sessionId) { _, sessionId in
            if sessionId != nil { page = .workout }
        }
        .onOpenURL { url in
            guard let link = WatchDeepLink(url: url),
                  let requested = shown(destination(for: link))
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
    private func destination(for link: WatchDeepLink) -> WatchPage? {
        switch link {
        case .goals:
            return .goals
        case .water:
            return .water
        case .fasting:
            return .fasting
        case .steps:
            return .steps
        }
    }

    @ViewBuilder
    private func view(for page: WatchPage) -> some View {
        switch page {
        case .goals:
            GoalSummaryView()
        case .water:
            WaterIntakeView()
        case .medications:
            MedicationsView()
        case .fasting:
            FastingView()
        case .steps:
            StepsView()
        case .entry:
            CheckInEntryView { self.page = shown(.trend) ?? self.page }
        case .trend:
            TrendView()
        case .workout:
            WorkoutView()
                .environment(\.workoutPageActive, selectedPage == .workout)
        case .nowPlaying:
            NowPlayingPage()
        case .recording:
            RecordingView()
        }
    }

    /// `page` if the wearer has it showing, else nil — so a jump to a page
    /// they turned off does nothing rather than selecting a tab that isn't
    /// there.
    private func shown(_ page: WatchPage?) -> WatchPage? {
        guard let page, pages.contains(page) else { return nil }
        return page
    }

    /// The tab on screen. Falls back to the landing page when nothing has been
    /// picked yet, or when the picked page has since been turned off on the
    /// phone.
    private var selectedPage: WatchPage {
        shown(page) ?? initialPage
    }

    /// Landing page on a normal (non-first-run) launch: the workout while one
    /// is running (always shown then, even if turned off), otherwise the first
    /// page in the wearer's order, so the page they put first is the one the
    /// app opens on.
    private var initialPage: WatchPage {
        if workout.isActive || run.isActive || recording.isActive { return .workout }
        return pages.first ?? .goals
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
                    Haptics.tap()
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
