import Foundation

/// Naming and clean-up rules for the exercise demo pictures the phone sends as
/// queued payloads (`transferUserInfo`). Pure Foundation so it runs under
/// `swift test` in `watch-tests/` with the other Domain logic.
enum ExerciseDemoFiles {
    /// Most pictures kept on disk (two per exercise, about 15 KB each).
    static let fileLimit = 80
    /// A plan's exercise never has more than start and end.
    static let maxIndex = 1

    /// A cache key that is safe as a file name: the phone sends an exercise
    /// id (a UUID or a free-exercise-db slug), and anything else is replaced.
    static func safeKey(_ key: String) -> String? {
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
        let cleaned = String(key.unicodeScalars.map { allowed.contains($0) ? Character($0) : "_" })
        return cleaned.isEmpty || cleaned.count > 80 ? nil : cleaned
    }

    static func fileName(key: String, index: Int) -> String? {
        guard (0...maxIndex).contains(index), let key = safeKey(key) else { return nil }
        return "\(key)-\(index).jpg"
    }

    /// The key a file name was made from.
    static func key(ofFileName name: String) -> String? {
        guard name.hasSuffix(".jpg"), let dash = name.lastIndex(of: "-") else { return nil }
        return String(name[..<dash])
    }

    /// Files to delete: the oldest beyond `limit`, never one whose key the
    /// current plan still names. `files` is each name with its modified date.
    static func filesToDelete(
        _ files: [(name: String, modified: Date)],
        keeping keys: Set<String>,
        limit: Int = fileLimit
    ) -> [String] {
        let kept = Set(keys.compactMap(safeKey))
        let overflow = files.count - limit
        guard overflow > 0 else { return [] }
        return files
            .filter { file in key(ofFileName: file.name).map { !kept.contains($0) } ?? true }
            .sorted { $0.modified < $1.modified }
            .prefix(overflow)
            .map(\.name)
    }
}
