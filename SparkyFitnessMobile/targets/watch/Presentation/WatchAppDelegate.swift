import UserNotifications
import WatchKit

/// Rest-end cues on the wrist.
///
/// The workout's `HKWorkoutSession` keeps this app running with the wrist
/// down, so the watch's own rest countdown reaches zero on time and can buzz
/// without the phone. The phone still schedules its "Rest complete"
/// notification for the same moment; while a workout is running here that
/// banner would be a second buzz for the same event, so it is hidden.
/// watchOS only asks the delegate while this app is frontmost; if the wearer
/// has switched to another app mid-workout the banner still shows, which is
/// a duplicate cue rather than a lost one.
final class WatchAppDelegate: NSObject, WKApplicationDelegate, UNUserNotificationCenterDelegate {
    /// Must match `REST_COMPLETE_CATEGORY` in the phone's notifications service.
    static let restCompleteCategory = "rest-complete"

    func applicationDidFinishLaunching() {
        UNUserNotificationCenter.current().delegate = self
        Task { @MainActor in
            WorkoutSessionStore.shared.onPersonalRecord = {
                MainActor.assumeIsolated {
                    guard CheckInStore.shared.context.effectiveHapticsEnabled else { return }
                    // Distinct from the plain success tick of a logged set.
                    WKInterfaceDevice.current().play(.notification)
                }
            }
            WorkoutSessionStore.shared.onRestFinished = {
                // Called by the main-actor workout store. Silent when the
                // phone has haptics or its rest-complete alert switched off.
                MainActor.assumeIsolated {
                    guard CheckInStore.shared.context.effectiveRestBuzzEnabled else { return }
                    WKInterfaceDevice.current().play(.notification)
                }
            }
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        let showNormally: UNNotificationPresentationOptions = [.banner, .list, .sound]
        guard notification.request.content.categoryIdentifier == Self.restCompleteCategory else {
            return showNormally
        }
        let watchOwnsRest = await MainActor.run { WorkoutSessionStore.shared.isActive }
        return watchOwnsRest ? [] : showNormally
    }
}
