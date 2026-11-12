import SwiftUI

/// Apple Health's four effort bands: 1-3, 4-6, 7-8 and 9-10.
enum EffortBand {
    case easy, moderate, hard, allOut

    init(score: Double) {
        switch score {
        case ..<3.5: self = .easy
        case ..<6.75: self = .moderate
        case ..<8.75: self = .hard
        default: self = .allOut
        }
    }

    var name: String {
        switch self {
        case .easy: return String(localized: "watch.effort.band.easy", defaultValue: "Easy")
        case .moderate: return String(localized: "watch.effort.band.moderate", defaultValue: "Moderate")
        case .hard: return String(localized: "watch.effort.band.hard", defaultValue: "Hard")
        case .allOut: return String(localized: "watch.effort.band.allOut", defaultValue: "All Out")
        }
    }

    var color: Color {
        switch self {
        case .easy: return .green
        case .moderate: return .yellow
        case .hard: return .orange
        case .allOut: return .red
        }
    }
}

/// A row of segments, one per value and coloured by band, with the chosen one
/// lit up to its left. Set with the Digital Crown or by dragging along it; the
/// workout effort and the effort after a set share it. `values` are the
/// numbers the segments stand for, in order.
struct EffortTrack: View {
    let values: [Double]
    @Binding var index: Int
    let hapticsEnabled: Bool

    /// The crown's position, a Double because that is what it binds to.
    @State private var position: Double = 0
    @FocusState private var focused: Bool
    /// True once the track has been touched. Until then the crown scrolls the
    /// page, so reading down a screen never moves the value.
    @State private var engaged = false

    var body: some View {
        GeometryReader { geo in
            HStack(spacing: 2) {
                ForEach(values.indices, id: \.self) { i in
                    let color = EffortBand(score: values[i]).color
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(color.opacity(i <= index ? 1 : 0.22))
                        .frame(height: i == index ? WatchStyle.s(22) : WatchStyle.s(14))
                        .frame(maxHeight: .infinity)
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { drag in
                    engaged = true
                    focused = true
                    let fraction = min(max(drag.location.x / max(geo.size.width, 1), 0), 0.999)
                    let next = Int(fraction * Double(values.count))
                    guard next != index else { return }
                    index = next
                    Haptics.tap()
                }
            )
        }
        .frame(height: WatchStyle.s(26))
        .focusable(engaged)
        .focused($focused)
        .digitalCrownRotation(
            $position,
            from: 0,
            through: Double(values.count - 1),
            by: 1,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: hapticsEnabled
        )
        .onAppear { position = Double(index) }
        .onChange(of: position) { index = min(max(Int(position.rounded()), 0), values.count - 1) }
        .onChange(of: index) { if Int(position.rounded()) != index { position = Double(index) } }
        .accessibilityElement()
        .accessibilityLabel(String(localized: "watch.effort.label", defaultValue: "Effort"))
        .accessibilityValue("\(Int(values[index]))")
        .accessibilityAdjustableAction { direction in
            index = min(max(index + (direction == .increment ? 1 : -1), 0), values.count - 1)
        }
    }
}
