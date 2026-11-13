import Foundation
import UIKit
import WatchConnectivity

/// The exercise demo pictures the phone sent as files, kept in Application
/// Support so they survive a relaunch (and are available with the phone out of
/// range). Two small JPEGs per exercise, named by the exercise's key
/// (`ExerciseDemoFiles`); the oldest beyond a cap are removed, never those of
/// the running workout. `revision` changes when a file arrives so a page that
/// was hidden for lack of pictures can appear.
@MainActor
final class ExerciseDemoStore: ObservableObject {
    static let shared = ExerciseDemoStore()

    @Published private(set) var revision = 0
    /// Decoded pictures by key, dropped whenever a file arrives.
    private var decoded: [String: [UIImage]] = [:]

    nonisolated static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("ExerciseDemo", isDirectory: true)
    }

    /// Moves a received file into the cache. Called on the session's queue
    /// before the delegate method returns, since the system deletes `file`.
    nonisolated static func receive(_ file: WCSessionFile) -> Bool {
        guard
            let metadata = file.metadata,
            metadata["type"] as? String == "exerciseImage",
            let key = metadata["key"] as? String,
            let index = (metadata["index"] as? NSNumber)?.intValue,
            let name = ExerciseDemoFiles.fileName(key: key, index: index)
        else { return false }
        return write(from: file.fileURL, named: name)
    }

    nonisolated static func write(from source: URL, named name: String) -> Bool {
        let fm = FileManager.default
        do {
            try fm.createDirectory(at: directory, withIntermediateDirectories: true)
            let target = directory.appendingPathComponent(name)
            if fm.fileExists(atPath: target.path) { try fm.removeItem(at: target) }
            try fm.copyItem(at: source, to: target)
            return true
        } catch {
            return false
        }
    }

    /// The start and end pictures for `key`, or none until the first has arrived.
    func images(for key: String?) -> [UIImage] {
        guard let key else { return [] }
        if let cached = decoded[key] { return cached }
        func load(_ index: Int) -> UIImage? {
            guard let name = ExerciseDemoFiles.fileName(key: key, index: index) else { return nil }
            return UIImage(contentsOfFile: Self.directory.appendingPathComponent(name).path)
        }
        // Only a first picture counts; a lone end picture is ignored.
        guard let start = load(0) else { return [] }
        let pictures = [start] + (load(1).map { [$0] } ?? [])
        decoded[key] = pictures
        return pictures
    }

    /// A file arrived (or a plan changed): refresh the pages and tidy the cache.
    func didChange() {
        decoded.removeAll()
        revision += 1
        prune()
    }

    private func prune() {
        let fm = FileManager.default
        let keys = Set(WorkoutSessionStore.shared.plan?.exercises.compactMap(\.imageKey) ?? [])
        guard let urls = try? fm.contentsOfDirectory(
            at: Self.directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else { return }
        let files = urls.map { url -> (name: String, modified: Date) in
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            return (url.lastPathComponent, date ?? .distantPast)
        }
        for name in ExerciseDemoFiles.filesToDelete(files, keeping: keys) {
            try? fm.removeItem(at: Self.directory.appendingPathComponent(name))
        }
    }

    #if DEBUG
    /// Screenshot seed: writes sample pictures as if the phone had sent them.
    func seed(key: String, jpegs: [Data]) {
        for (index, data) in jpegs.enumerated() {
            guard let name = ExerciseDemoFiles.fileName(key: key, index: index) else { continue }
            let temp = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            try? data.write(to: temp)
            _ = Self.write(from: temp, named: name)
            try? FileManager.default.removeItem(at: temp)
        }
        didChange()
    }
    #endif
}
