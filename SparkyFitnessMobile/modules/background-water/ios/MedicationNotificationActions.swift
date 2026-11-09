import ExpoModulesCore
import ExpoNotifications
import Foundation
import Security
import UIKit
import UserNotifications

// Handles the Taken / Skip / Snooze buttons on a medication reminder without
// JavaScript, so a tap works when the app is closed or suspended. iOS wakes the
// app in the background for these buttons (they do not open it), and the
// JavaScript runtime is not reliably there to answer.
//
// It plugs into expo-notifications as a `NotificationDelegate`, registered in
// `application(_:didFinishLaunchingWithOptions:)`, so it sees the response
// before the module that forwards it to JavaScript. It reaches the server with
// the login `BackgroundWaterModule.setConfig` keeps in the Keychain, the same
// copy the Siri and Shortcuts actions use.
//
// One owner per tap: a response this file takes is claimed (stored in
// UserDefaults before any work starts) and `isMedicationActionClaimed` lets
// `medicationNotificationHandler.ts` skip it. `medication_entries` has no unique
// constraint on a dose, so two writers would log it twice. When this file
// cannot do the work (no stored login, unknown data) it leaves the response
// unclaimed and JavaScript handles it as before.
//
// What happened is left in a small ledger in UserDefaults for JavaScript to
// apply when it next runs (`readMedicationActionResults`, confirmed with `acknowledgeMedicationActionResults`): the snooze record,
// cache invalidation, and any write that failed, which goes onto the existing
// pending-actions queue and is replayed when the app opens. Keep the category
// ids, action ids and data keys in step with src/services/notifications.ts and
// medicationReminderService.ts.

private let medicationCategories: Set<String> = [
    "medication-reminder",
    "medication-reminder-group",
]
private let takenAction = "medication-taken"
private let skipAction = "medication-skip"
private let snoozeAction = "medication-snooze"

private let medicationAppService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let medicationAppAccount = "config"

private let snoozeMinutesKey = "sparky.medication.snoozeMinutes"
private let claimsKey = "sparky.medication.claimedActions"
private let resultsKey = "sparky.medication.actionResults"
private let defaultSnoozeMinutes = 30
private let claimLifetime: TimeInterval = 2 * 24 * 60 * 60
private let resultsLimit = 50
private let activeUserKey = "sparky.medication.activeUserId"

let medicationActionResultNotification = Notification.Name("SparkyMedicationActionResult")

// MARK: - Shared state

enum MedicationActionStore {
    private static let lock = NSLock()
    private static var defaults: UserDefaults { .standard }

    static func setSnoozeMinutes(_ minutes: Int) {
        defaults.set(minutes, forKey: snoozeMinutesKey)
    }

    static var snoozeMinutes: Int {
        let stored = defaults.integer(forKey: snoozeMinutesKey)
        return stored > 0 ? stored : defaultSnoozeMinutes
    }

    private static func claimKey(_ notificationId: String, _ actionId: String) -> String {
        "\(notificationId)|\(actionId)"
    }

    static func isClaimed(_ notificationId: String, _ actionId: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let claims = defaults.dictionary(forKey: claimsKey) as? [String: Double] ?? [:]
        return claims[claimKey(notificationId, actionId)] != nil
    }

    /// True when this call took the response, false when it was already taken.
    static func claim(_ notificationId: String, _ actionId: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        let now = Date().timeIntervalSince1970
        var claims = defaults.dictionary(forKey: claimsKey) as? [String: Double] ?? [:]
        claims = claims.filter { now - $0.value < claimLifetime }
        let key = claimKey(notificationId, actionId)
        if claims[key] != nil { return false }
        claims[key] = now
        defaults.set(claims, forKey: claimsKey)
        return true
    }

    /// The account the reminders on this device belong to, pushed by JavaScript
    /// once it knows it. Taken and Skip are only handled natively for a
    /// reminder that names this account, so a reminder left over from another
    /// account is never logged into the current one.
    static func setActiveUserId(_ userId: String?) {
        if let userId, !userId.isEmpty {
            defaults.set(userId, forKey: activeUserKey)
        } else {
            defaults.removeObject(forKey: activeUserKey)
        }
    }

    static var activeUserId: String? { defaults.string(forKey: activeUserKey) }

    /// Gives a claim back, so a press that could not be carried out (a snooze
    /// that failed to schedule) can be tried again.
    static func release(_ notificationId: String, _ actionId: String) {
        lock.lock(); defer { lock.unlock() }
        var claims = defaults.dictionary(forKey: claimsKey) as? [String: Double] ?? [:]
        claims.removeValue(forKey: claimKey(notificationId, actionId))
        defaults.set(claims, forKey: claimsKey)
    }

    // The ledger is stored as one JSON blob: UserDefaults rejects the NSNull a
    // missing user, key or schedule id leaves in a result.
    private static var inFlight = Set<String>()

    private static func readLedger() -> [[String: Any]] {
        guard let data = defaults.data(forKey: resultsKey),
              let results = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        else { return [] }
        return results
    }

    private static func writeLedger(_ results: [[String: Any]]) {
        if results.isEmpty {
            defaults.removeObject(forKey: resultsKey)
        } else if let data = try? JSONSerialization.data(withJSONObject: results) {
            defaults.set(data, forKey: resultsKey)
        }
    }

    /// Past the limit, results that carry nothing to retry go first: a failed
    /// dose is never dropped before JavaScript has queued it.
    private static func trim(_ results: [[String: Any]]) -> [[String: Any]] {
        var results = results
        while results.count > resultsLimit {
            if let index = results.firstIndex(where: { !carriesRetry($0) }) {
                results.remove(at: index)
            } else {
                break
            }
        }
        return results
    }

    private static func carriesRetry(_ result: [String: Any]) -> Bool {
        // A snooze result must also survive until JavaScript records it, or
        // reconciliation could schedule repeat reminders for a snoozed dose.
        if result["kind"] as? String == "snooze" { return true }
        guard result["kind"] as? String == "action" else { return false }
        return !((result["failedDoses"] as? [[String: Any]]) ?? []).isEmpty
    }

    /// Records the press before any network work starts, as a result that
    /// still has every dose to do. If iOS ends the app mid-request, the next
    /// run reads it and retries (the retry lists the day first, so doses that
    /// were written are not written again). `finish` replaces it.
    static func begin(_ result: [String: Any]) -> String {
        let id = UUID().uuidString
        var entry = result
        entry["id"] = id
        lock.lock()
        inFlight.insert(id)
        writeLedger(trim(readLedger() + [entry]))
        lock.unlock()
        return id
    }

    static func finish(_ id: String, _ result: [String: Any]) {
        var entry = result
        entry["id"] = id
        lock.lock()
        var results = readLedger()
        if let index = results.firstIndex(where: { $0["id"] as? String == id }) {
            results[index] = entry
        } else {
            results.append(entry)
        }
        writeLedger(trim(results))
        inFlight.remove(id)
        lock.unlock()
        notifyResultAvailable()
    }

    static func append(_ result: [String: Any]) {
        var entry = result
        entry["id"] = UUID().uuidString
        lock.lock()
        writeLedger(trim(readLedger() + [entry]))
        lock.unlock()
        notifyResultAvailable()
    }

    private static func notifyResultAvailable() {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: medicationActionResultNotification, object: nil)
        }
    }

    /// Everything not still being worked on in this process. Nothing is
    /// removed until JavaScript acknowledges it, so a result survives a
    /// failed write on the JavaScript side.
    static func readResults() -> [[String: Any]] {
        lock.lock(); defer { lock.unlock() }
        return readLedger().filter { !inFlight.contains($0["id"] as? String ?? "") }
    }

    static func acknowledge(_ ids: [String]) {
        guard !ids.isEmpty else { return }
        lock.lock(); defer { lock.unlock() }
        let done = Set(ids)
        writeLedger(readLedger().filter { !done.contains($0["id"] as? String ?? "") })
    }
}

// MARK: - Login

private struct MedicationLogin: Decodable {
    let baseUrl: String
    let headers: [String: String]

    private static func copy(accessGroup: String?) -> Data? {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: medicationAppService,
            kSecAttrAccount as String: medicationAppAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        if let accessGroup { query[kSecAttrAccessGroup as String] = accessGroup }
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }

    static func load() -> MedicationLogin? {
        var data: Data?
        if let group = Bundle.main.object(forInfoDictionaryKey: "SparkyKeychainGroup") as? String,
           !group.isEmpty, !group.contains("$(") {
            data = copy(accessGroup: group)
        }
        // A build without the shared group, or an older copy, sits in the app's own group.
        if data == nil { data = copy(accessGroup: nil) }
        guard let data else { return nil }
        return try? JSONDecoder().decode(MedicationLogin.self, from: data)
    }
}

/// Answers a redirect with its own 3xx response, so the login never goes to another host.
private final class MedicationRefuseRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

private enum MedicationApi {
    struct Failure: Error {}

    static func send(
        _ login: MedicationLogin,
        method: String,
        path: String,
        body: [String: Any]? = nil
    ) async throws -> Data {
        guard let url = URL(string: login.baseUrl + path) else { throw Failure() }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.httpMethod = method
        for (name, value) in login.headers { request.setValue(value, forHTTPHeaderField: name) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(
            for: request, delegate: MedicationRefuseRedirects())
        guard let status = (response as? HTTPURLResponse)?.statusCode,
              (200..<300).contains(status) else { throw Failure() }
        return data
    }
}

// MARK: - Notification data

private struct MedicationDose {
    let medicationId: String
    let scheduleId: String?

    var json: [String: Any] {
        ["medicationId": medicationId, "scheduleId": scheduleId ?? NSNull()]
    }
}

private struct MedicationReminderData {
    let info: [String: Any]
    let doses: [MedicationDose]
    let entryDate: String
    let baseKey: String?
    let userId: String?

    /// The tapped reminder's `data`, or nil when it is not a reminder this file can act on.
    init?(userInfo: [AnyHashable: Any]) {
        var flat = userInfo as? [String: Any] ?? [:]
        if let nested = userInfo["body"] as? [String: Any], flat["entryDate"] == nil {
            flat = nested
        }
        guard let entryDate = flat["entryDate"] as? String, !entryDate.isEmpty else { return nil }
        let doses = MedicationReminderData.parseDoses(flat)
        guard !doses.isEmpty else { return nil }
        self.info = flat
        self.doses = doses
        self.entryDate = entryDate
        self.baseKey = (flat["baseKey"] as? String) ?? (flat["key"] as? String)
        self.userId = flat["userId"] as? String
    }

    static func parseDoses(_ info: [String: Any]) -> [MedicationDose] {
        var raw: [[String: Any]]?
        if let text = info["doses"] as? String, let data = text.data(using: .utf8) {
            raw = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]]
        } else if let array = info["doses"] as? [[String: Any]] {
            raw = array
        }
        if let raw, !raw.isEmpty {
            return raw.compactMap { item in
                guard let id = item["medicationId"] as? String else { return nil }
                return MedicationDose(medicationId: id, scheduleId: item["scheduleId"] as? String)
            }
        }
        if let id = info["medicationId"] as? String {
            return [MedicationDose(medicationId: id, scheduleId: info["scheduleId"] as? String)]
        }
        return []
    }

    /// Mirrors `doesNotificationMatchAction` in medicationNotificationHandler.ts.
    static func matches(
        _ userInfo: [AnyHashable: Any],
        key: String?,
        doses: [MedicationDose],
        entryDate: String
    ) -> Bool {
        guard let other = MedicationReminderData(userInfo: userInfo) else { return false }
        let otherKey = other.info["key"] as? String
        if let key,
           other.baseKey == key || otherKey == key || (otherKey?.hasPrefix("\(key)_") ?? false) {
            return true
        }
        if other.entryDate != entryDate { return false }
        return other.doses.allSatisfy { theirs in
            doses.contains { $0.medicationId == theirs.medicationId && $0.scheduleId == theirs.scheduleId }
        }
    }
}

/// Mirrors `entryMatchesDose` / `isDoseLogged` in utils/medications.ts.
private func isDoseLogged(_ entries: [[String: Any]], _ dose: MedicationDose) -> Bool {
    entries.contains { entry in
        let status = entry["status"] as? String
        guard status == "taken" || status == "skipped" else { return false }
        let scheduleId = entry["schedule_id"] as? String
        if let wanted = dose.scheduleId {
            if scheduleId == wanted { return true }
            return entry["medication_id"] as? String == dose.medicationId
                && scheduleId == nil && status != "prn_taken"
        }
        return entry["medication_id"] as? String == dose.medicationId && scheduleId == nil
    }
}

/// Runs the native dose writes one after another, so a second press waits for
/// the first to finish and then lists the day again, seeing what it wrote.
private actor MedicationWriteQueue {
    static let shared = MedicationWriteQueue()
    private var tail: Task<Void, Never>?

    func run(_ work: @escaping @Sendable () async -> Void) async {
        let previous = tail
        let next = Task {
            await previous?.value
            await work()
        }
        tail = next
        await next.value
    }
}

// MARK: - Delegate

public final class MedicationNotificationActions: NSObject, NotificationDelegate {
    static let shared = MedicationNotificationActions()
    private let center = UNUserNotificationCenter.current()

    public func didReceive(
        _ response: UNNotificationResponse,
        completionHandler: @escaping () -> Void
    ) -> Bool {
        let content = response.notification.request.content
        let actionId = response.actionIdentifier
        guard medicationCategories.contains(content.categoryIdentifier),
              actionId == takenAction || actionId == skipAction || actionId == snoozeAction,
              let data = MedicationReminderData(userInfo: content.userInfo) else { return false }

        let isSnooze = actionId == snoozeAction
        let login = isSnooze ? nil : MedicationLogin.load()
        // Taken and Skip need the stored login; without it JavaScript logs the dose.
        if !isSnooze && login == nil { return false }
        // Taken and Skip also need the reminder to belong to the account this
        // device is signed in to. One that does not (left over from another
        // account, or from before the account was known) is left to
        // JavaScript, which checks ownership against the account's medications.
        if !isSnooze {
            guard let active = MedicationActionStore.activeUserId,
                  let owner = data.userId, owner == active else { return false }
        }

        let notificationId = response.notification.request.identifier
        // A second delivery of the same tap is ours, already done or running.
        guard MedicationActionStore.claim(notificationId, actionId) else { return true }

        // The system gives a background launch only moments once the delegate
        // returns. Ask for the extra time a network call needs.
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask(withName: "medication-action") {
            UIApplication.shared.endBackgroundTask(task)
            task = .invalid
        }
        Task {
            if isSnooze {
                await self.snooze(content, data, notificationId)
            } else if let login {
                let status = actionId == takenAction ? "taken" : "skipped"
                // Recorded right after the claim and before waiting for any other
                // write, so a press iOS ends while it is queued is still retried.
                let (ledgerId, base) = self.recordPress(status, data, notificationId)
                // One write at a time: two reminders for the same dose acted on
                // together would otherwise both see it unlogged and both log it.
                await MedicationWriteQueue.shared.run {
                    await self.log(login, status, data, notificationId, ledgerId, base)
                }
            }
            await MainActor.run {
                if task != .invalid { UIApplication.shared.endBackgroundTask(task) }
            }
        }
        return true
    }

    // MARK: Taken / Skip

    /// Writes the press to the ledger with every dose still to do, before any
    /// network work. `log` replaces it with the outcome.
    private func recordPress(
        _ status: String,
        _ data: MedicationReminderData,
        _ notificationId: String
    ) -> (String, [String: Any]) {
        var base: [String: Any] = [
            "kind": "action",
            "status": status,
            "notificationId": notificationId,
            "key": data.baseKey ?? NSNull(),
            "entryDate": data.entryDate,
            "userId": data.userId ?? NSNull(),
            "doses": data.doses.map { $0.json },
        ]
        if status == "taken" { base["takenAt"] = isoString(Date()) }
        var pendingResult = base
        pendingResult["failedDoses"] = data.doses.map { $0.json }
        pendingResult["loggedCount"] = 0
        return (MedicationActionStore.begin(pendingResult), base)
    }

    private func log(
        _ login: MedicationLogin,
        _ status: String,
        _ data: MedicationReminderData,
        _ notificationId: String,
        _ ledgerId: String,
        _ pressed: [String: Any]
    ) async {
        var base = pressed
        let takenAt = pressed["takenAt"] as? String
        await removeDelivered([notificationId])

        var failed: [MedicationDose] = []
        var logged = 0
        do {
            var path = "/api/v2/medications/entries?fromDate=\(data.entryDate)&toDate=\(data.entryDate)"
            if data.doses.count == 1 {
                path += "&medicationId=\(data.doses[0].medicationId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? data.doses[0].medicationId)"
            }
            // A failed list must not read as "nothing logged yet": the error goes
            // to the catch below, which leaves every dose to the retry queue.
            let listed = try await MedicationApi.send(login, method: "GET", path: path)
            // Anything but a JSON array (a proxy's 200 page or object) is a failed list.
            guard let existing = try JSONSerialization.jsonObject(with: listed) as? [[String: Any]] else {
                throw MedicationApi.Failure()
            }
            for dose in data.doses where !isDoseLogged(existing, dose) {
                var body: [String: Any] = [
                    "medication_id": dose.medicationId,
                    "schedule_id": dose.scheduleId ?? NSNull(),
                    "status": status,
                    "entry_date": data.entryDate,
                ]
                if let takenAt { body["taken_at"] = takenAt }
                do {
                    _ = try await MedicationApi.send(login, method: "POST", path: "/api/v2/medications/entries", body: body)
                    logged += 1
                } catch {
                    failed.append(dose)
                }
            }
        } catch {
            // The list failed, so nothing is known about the doses: leave them all to retry.
            failed = data.doses
        }

        if failed.isEmpty {
            await clearMatching(
                except: notificationId, key: data.baseKey, doses: data.doses, entryDate: data.entryDate)
        }
        base["failedDoses"] = failed.map { $0.json }
        base["loggedCount"] = logged
        MedicationActionStore.finish(ledgerId, base)
    }

    // MARK: Snooze

    private func snooze(
        _ content: UNNotificationContent,
        _ data: MedicationReminderData,
        _ notificationId: String
    ) async {
        let minutes = MedicationActionStore.snoozeMinutes
        let triggerTime = Date().addingTimeInterval(TimeInterval(minutes * 60))
        let baseKey = data.baseKey ?? "\(data.entryDate)_\(data.doses[0].medicationId)"
        let snoozeKey = "\(baseKey)_snooze_\(Int(triggerTime.timeIntervalSince1970 * 1000))"

        var info = data.info
        info["medicationId"] = data.doses[0].medicationId
        if let scheduleId = data.doses[0].scheduleId { info["scheduleId"] = scheduleId }
        info["entryDate"] = data.entryDate
        info["baseKey"] = baseKey
        info["key"] = snoozeKey
        info["isSnoozed"] = "true"

        let replacement = (content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        replacement.userInfo = info
        let identifier = UUID().uuidString
        let request = UNNotificationRequest(
            identifier: identifier,
            content: replacement,
            trigger: UNTimeIntervalNotificationTrigger(timeInterval: TimeInterval(minutes * 60), repeats: false))
        do {
            try await center.add(request)
        } catch {
            // The original stays on screen so the dose is not lost; JavaScript is not told it was snoozed.
            MedicationActionStore.release(notificationId, snoozeAction)
            MedicationActionStore.append([
                "kind": "snoozeFailed", "notificationId": notificationId, "entryDate": data.entryDate,
            ])
            return
        }
        await removeDelivered([notificationId])
        await clearMatching(
            except: identifier, exceptKey: snoozeKey, key: baseKey, doses: data.doses, entryDate: data.entryDate)
        MedicationActionStore.append([
            "kind": "snooze",
            "baseKey": baseKey,
            "entryDate": data.entryDate,
            "doses": data.doses.map { $0.json },
            "minutes": minutes,
        ])
    }

    // MARK: Notification center

    private func removeDelivered(_ identifiers: [String]) async {
        center.removeDeliveredNotifications(withIdentifiers: identifiers)
    }

    /// Clears sibling delivered reminders and scheduled repeats for the same doses.
    private func clearMatching(
        except identifier: String,
        exceptKey: String? = nil,
        key: String?,
        doses: [MedicationDose],
        entryDate: String
    ) async {
        let delivered = await withCheckedContinuation { (cont: CheckedContinuation<[UNNotification], Never>) in
            center.getDeliveredNotifications { cont.resume(returning: $0) }
        }
        center.removeDeliveredNotifications(withIdentifiers: delivered.compactMap {
            let request = $0.request
            guard request.identifier != identifier,
                  MedicationReminderData.matches(request.content.userInfo, key: key, doses: doses, entryDate: entryDate)
            else { return nil }
            return request.identifier
        })
        let pending = await withCheckedContinuation { (cont: CheckedContinuation<[UNNotificationRequest], Never>) in
            center.getPendingNotificationRequests { cont.resume(returning: $0) }
        }
        center.removePendingNotificationRequests(withIdentifiers: pending.compactMap { request in
            if request.identifier == identifier { return nil }
            if let exceptKey, request.content.userInfo["key"] as? String == exceptKey { return nil }
            guard MedicationReminderData.matches(
                request.content.userInfo, key: key, doses: doses, entryDate: entryDate) else { return nil }
            return request.identifier
        })
    }
}

private func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
}

// MARK: - Registration

/// Registers the delegate at launch, before expo-notifications' emitter module
/// exists, so it sees every response first and its claim is in place before
/// JavaScript hears about the same tap.
public final class MedicationNotificationSubscriber: ExpoAppDelegateSubscriber {
    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        NotificationCenterManager.shared.addDelegate(MedicationNotificationActions.shared)
        return true
    }
}
