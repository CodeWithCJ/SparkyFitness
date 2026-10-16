import AVFoundation

/// Speaks a wrist-only run's cues: start, pauses, splits ("Kilometer 3, 5
/// minutes 24 seconds"), plan steps and the finish.
/// Audio comes out of the watch speaker or paired Bluetooth headphones; the
/// run's Voice cues switch (`WatchRunSettings.voiceCues`) turns it on.
final class WatchRunCues: NSObject, AVSpeechSynthesizerDelegate {
    static let shared = WatchRunCues()

    private let synthesizer = AVSpeechSynthesizer()

    private override init() {
        super.init()
        synthesizer.delegate = self
    }

    /// Queues `text` after whatever is being said. A step change passes
    /// `interrupt` so it is heard at once, but a split spoken in the same
    /// second waits its turn instead of cutting it off.
    @MainActor
    func speak(_ text: String, interrupt: Bool = false) {
        // The wearer's headphones are usually on the phone, so a cue goes there
        // when it can be reached. Headphones already connected to the watch
        // are respected, and anything the phone does not confirm is said here.
        if !outputsToHeadphones(),
           WatchSessionManager.shared.relayRunCue(text, interrupt: interrupt, fallback: { [weak self] in
               self?.speakHere(text, interrupt: interrupt)
           }) {
            return
        }
        speakHere(text, interrupt: interrupt)
    }

    /// Whether the watch's audio is going to Bluetooth headphones now.
    private func outputsToHeadphones() -> Bool {
        AVAudioSession.sharedInstance().currentRoute.outputs.contains {
            [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE].contains($0.portType)
        }
    }

    private func speakHere(_ text: String, interrupt: Bool) {
        // Plain spoken-prompt playback, ducking music under the cue. A failure
        // is printed (it shows in the device console) rather than silently
        // swallowed, and the cue is still spoken on whatever session there is.
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .voicePrompt, policy: .default, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            print("[WatchRunCues] audio session: \(error)")
        }
        if interrupt { synthesizer.stopSpeaking(at: .immediate) }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier.replacingOccurrences(of: "_", with: "-"))
        synthesizer.speak(utterance)
    }

    /// Stops whatever is being said, for when the wearer turns cues off.
    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    /// Hands the audio back once the last cue is done, so music or a podcast
    /// that was ducked for it comes back up.
    private func releaseAudioIfIdle() {
        guard !synthesizer.isSpeaking else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        releaseAudioIfIdle()
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        releaseAudioIfIdle()
    }

    /// "5 minutes 24 seconds", spelled out for speech.
    static func duration(_ seconds: TimeInterval) -> String {
        // Locale-aware and plural-correct, e.g. "5 minutes, 24 seconds".
        Duration.seconds(Int64(seconds.rounded()))
            .formatted(.units(allowed: [.minutes, .seconds], width: .wide))
    }

    /// What is said at the finish: "Outdoor run saved. 3.21 kilometers in
    /// 25 minutes 10 seconds."
    static func finishText(title: String, distanceMeters: Double, seconds: TimeInterval, usesMiles: Bool) -> String {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        let amount = String(format: "%.2f", distanceMeters / unitMeters)
        let time = duration(seconds)
        return usesMiles
            ? String(localized: "watch.run.cue.finishedMiles", defaultValue: "\(title) saved. \(amount) miles in \(time).")
            : String(localized: "watch.run.cue.finishedKm", defaultValue: "\(title) saved. \(amount) kilometers in \(time).")
    }

    /// What is said when a plan step begins: "Run, 1 minute."
    static func stepText(label: String, seconds: TimeInterval) -> String {
        String(localized: "watch.run.cue.step", defaultValue: "\(label), \(duration(seconds)).")
    }

    /// Words for a distance step beginning: "Fast, 400 meters." or "Fast, 0.25 miles."
    static func stepText(label: String, meters: Double, inMiles: Bool = false) -> String {
        "\(label), \(distance(meters, inMiles: inMiles))."
    }

    /// Said near the end of a distance step: "100 meters to go." or "0.1 miles to go."
    static func toGoText(inMiles: Bool) -> String {
        "\(distance(toGoMeters(inMiles: inMiles), inMiles: inMiles)) to go."
    }

    /// How close to the end of a distance step the "to go" cue is said (100 m,
    /// or a tenth of a mile), and the shortest step that gets one. The phone
    /// uses the same figures (`stepToGoMeters`, `STEP_TO_GO_MIN_METERS`).
    static func toGoMeters(inMiles: Bool) -> Double { inMiles ? 160.9344 : 100 }
    static let toGoMinimumStep: Double = 300

    /// "400 meters", "1.5 kilometers" from a kilometre up, or "0.25 miles".
    private static func distance(_ meters: Double, inMiles: Bool) -> String {
        if inMiles {
            let miles = (meters / 1609.344 * 100).rounded() / 100
            return miles == 1 ? "1 mile" : "\(WatchRunPlan.trimmed(miles, digits: 2)) miles"
        }
        if meters >= 1000 {
            let km = (meters / 100).rounded() / 10
            return km == 1 ? "1 kilometer" : "\(WatchRunPlan.trimmed(km, digits: 1)) kilometers"
        }
        let whole = Int(meters.rounded())
        return whole == 1 ? "1 meter" : "\(whole) meters"
    }

    /// "Ten seconds. Next, Run." or, on the last step, "Ten seconds to go."
    static func stepWarningText(next: String?) -> String {
        next.map { "Ten seconds. Next, \($0)." } ?? "Ten seconds to go."
    }

    static let stepCountdownText = "Three. Two. One."

    /// Said when the distance passes 5K, 10K, a half marathon or a marathon.
    static func milestoneText(meters: Double) -> String {
        if meters >= 42195 { return "Marathon distance. Incredible." }
        if meters >= 21097.5 { return "Half marathon distance. Amazing." }
        if meters >= 10000 { return "10K done. Strong effort." }
        return "5K done. Nice work."
    }

    static let halfwayText = "Halfway there. Keep it up."
    static let lastMinuteText = "One minute left. Finish strong."

    /// The periodic update: the time, and outdoors the distance and average
    /// pace. Indoors the distance is only an estimate, so just the time.
    static func checkInText(seconds: TimeInterval, distanceMeters: Double?, usesMiles: Bool) -> String {
        let time = duration(seconds)
        guard let distanceMeters, distanceMeters >= 10 else { return "\(time) done." }
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        let count = (distanceMeters / unitMeters * 10).rounded() / 10
        let amount = count == count.rounded() ? String(Int(count)) : String(format: "%.1f", count)
        let unitWord = usesMiles ? (count == 1 ? "mile" : "miles") : (count == 1 ? "kilometer" : "kilometers")
        let pace = duration((seconds / distanceMeters * unitMeters).rounded())
        return "\(time). \(amount) \(unitWord). Average pace \(pace) per \(usesMiles ? "mile" : "kilometer")."
    }

    /// Words for a completed split. Durations are spelled out because a speech
    /// engine reads "5:24" as a time of day.
    static func splitText(number: Int, seconds: TimeInterval, usesMiles: Bool) -> String {
        let time = duration(seconds)
        return usesMiles
            ? String(localized: "watch.run.cue.splitMile", defaultValue: "Mile \(number). \(time).")
            : String(localized: "watch.run.cue.splitKm", defaultValue: "Kilometer \(number). \(time).")
    }

    /// Whole units covered, and how many of them are new since `cued`.
    static func completedSplits(distanceMeters: Double, usesMiles: Bool) -> Int {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        return Int((distanceMeters / unitMeters).rounded(.down))
    }
}
