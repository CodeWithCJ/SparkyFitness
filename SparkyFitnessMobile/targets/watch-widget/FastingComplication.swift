import WidgetKit
import SwiftUI

// Fasting complication. ComplicationPublisher writes `fastingSnapshot` whenever
// the phone's context carries a fast (or says there is none). Elapsed time uses
// the system's live timer text so it counts without timeline reloads; the
// ring is refreshed by a timeline entry every 15 minutes.

private struct FastingSnapshotPayload: Decodable {
    let active: Bool?
    let startedAt: Double?
    let targetEndAt: Double?
    let label: String?
}

struct FastingEntry: TimelineEntry {
    let date: Date
    let start: Date?
    let target: Date?
    let label: String?

    var isFasting: Bool { start != nil }

    /// 0...1 toward the goal as of `date`; 0 for an open-ended fast.
    var progress: Double {
        guard let start, let target, target > start else { return 0 }
        return max(0, min(1, date.timeIntervalSince(start) / target.timeIntervalSince(start)))
    }

    var elapsedHours: Int {
        guard let start else { return 0 }
        return max(0, Int(date.timeIntervalSince(start) / 3600))
    }
}

private func loadFastingSnapshot() -> (start: Date?, target: Date?, label: String?) {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "fastingSnapshot"),
        let payload = try? JSONDecoder().decode(FastingSnapshotPayload.self, from: data),
        payload.active == true,
        let started = payload.startedAt
    else { return (nil, nil, nil) }
    return (
        Date(timeIntervalSince1970: started / 1000),
        payload.targetEndAt.map { Date(timeIntervalSince1970: $0 / 1000) },
        payload.label
    )
}

struct FastingProvider: TimelineProvider {
    func placeholder(in context: Context) -> FastingEntry {
        FastingEntry(
            date: Date(), start: Date().addingTimeInterval(-10 * 3600),
            target: Date().addingTimeInterval(6 * 3600), label: "16:8")
    }

    func getSnapshot(in context: Context, completion: @escaping (FastingEntry) -> Void) {
        let s = loadFastingSnapshot()
        completion(FastingEntry(date: Date(), start: s.start, target: s.target, label: s.label))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FastingEntry>) -> Void) {
        let s = loadFastingSnapshot()
        let now = Date()
        guard s.start != nil else {
            completion(Timeline(
                entries: [FastingEntry(date: now, start: nil, target: nil, label: nil)],
                policy: .after(now.addingTimeInterval(3600))))
            return
        }
        // 15-minute steps for the next 12 hours keeps the ring moving.
        let entries = (0..<48).map { step in
            FastingEntry(
                date: now.addingTimeInterval(Double(step) * 900),
                start: s.start, target: s.target, label: s.label)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct FastingComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FastingEntry

    var body: some View {
        content
            .widgetURL(ComplicationLink.fasting.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                entry.isFasting ? "Fasting for \(entry.elapsedHours) hours." : "Not fasting.")
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: "timer")
                .font(.title3)
                .foregroundStyle(.orange)
                .widgetLabel {
                    if entry.isFasting {
                        ProgressView(value: entry.progress)
                            .tint(.orange)
                    } else {
                        Text("No fast")
                    }
                }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(entry.label ?? "Fasting", systemImage: "timer")
                    .font(.headline)
                    .foregroundStyle(.orange)
                if let start = entry.start {
                    Text(start, style: .timer)
                        .font(.system(.title3, design: .rounded).weight(.semibold))
                        .monospacedDigit()
                    if entry.target != nil {
                        ProgressView(value: entry.progress).tint(.orange)
                    }
                } else {
                    Text("Not fasting")
                        .foregroundStyle(.secondary)
                }
            }
        case .accessoryInline:
            if let start = entry.start {
                Label {
                    Text(start, style: .timer)
                } icon: {
                    Image(systemName: "timer")
                }
            } else {
                Label("No fast", systemImage: "timer")
            }
        default:
            Gauge(value: entry.progress) {
                Image(systemName: "timer")
            } currentValueLabel: {
                Text(entry.isFasting ? "\(entry.elapsedHours)h" : "--")
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
            .tint(.orange)
        }
    }
}

struct FastingComplication: Widget {
    // Must match ComplicationPublisher's Fasting.kind (targets/watch).
    let kind: String = "fastingComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FastingProvider()) { entry in
            FastingComplicationView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Fasting")
        .description("Time into your current fast and progress toward its goal.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}
