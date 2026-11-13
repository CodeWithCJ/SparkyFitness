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

    /// The mockups' band colours: teal, amber, orange, red.
    var color: Color {
        switch self {
        case .easy: return Color(red: 60 / 255, green: 200 / 255, blue: 180 / 255)
        case .moderate: return Color(red: 233 / 255, green: 192 / 255, blue: 74 / 255)
        case .hard: return Color(red: 1, green: 138 / 255, blue: 61 / 255)
        case .allOut: return Color(red: 1, green: 90 / 255, blue: 78 / 255)
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

    /// One colour for every segment (the set effort, which has no bands).
    var uniform: Color?

    private static let off = Color(red: 42 / 255, green: 44 / 255, blue: 48 / 255)

    var body: some View {
        let dense = values.count > 10
        GeometryReader { geo in
            HStack(spacing: WatchStyle.m(dense ? 3 : 4)) {
                ForEach(values.indices, id: \.self) { i in
                    let color = uniform ?? EffortBand(score: values[i]).color
                    if i == index {
                        thumb(color)
                    } else {
                        RoundedRectangle(cornerRadius: WatchStyle.m(dense ? 3 : 5), style: .continuous)
                            .fill(i < index ? color : Self.off)
                            .frame(height: WatchStyle.m(dense ? 8 : 10))
                            .frame(maxHeight: .infinity)
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onChanged { drag in
                    engaged = true
                    // Focus only takes effect once `.focusable(engaged)` has
                    // rendered, so ask on the next turn of the run loop.
                    DispatchQueue.main.async { focused = true }
                    let fraction = min(max(drag.location.x / max(geo.size.width, 1), 0), 0.999)
                    let next = Int(fraction * Double(values.count))
                    guard next != index else { return }
                    index = next
                    Haptics.tap()
                }
            )
        }
        .frame(height: WatchStyle.m(28))
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
        .accessibilityValue(SetValueText.format(values[index]))
        .accessibilityAdjustableAction { direction in
            index = min(max(index + (direction == .increment ? 1 : -1), 0), values.count - 1)
        }
    }

    /// The chosen value's handle: white, ringed in black and then the colour.
    private func thumb(_ color: Color) -> some View {
        RoundedRectangle(cornerRadius: WatchStyle.m(8), style: .continuous)
            .fill(Color.white)
            .overlay(
                Capsule().fill(Color.black.opacity(0.35)).frame(width: WatchStyle.m(2), height: WatchStyle.m(10))
            )
            .frame(width: WatchStyle.m(16), height: WatchStyle.m(26))
            .padding(WatchStyle.m(2))
            .background(Color.black, in: RoundedRectangle(cornerRadius: WatchStyle.m(10), style: .continuous))
            .padding(WatchStyle.m(2))
            .background(color, in: RoundedRectangle(cornerRadius: WatchStyle.m(12), style: .continuous))
            .padding(-WatchStyle.m(4))
            .frame(width: WatchStyle.m(16), height: WatchStyle.m(26))
    }
}
