import ExpoModulesCore
import Security
import WidgetKit

// Holds the server address, login, weight unit and water container the Siri and
// Shortcuts App Intents (targets/widget/ShortcutIntents.swift) need while the app
// is closed. The copy exists while a server is signed in: JavaScript passes nil
// when the user signs out or removes the server, which erases it. It lives in
// the Keychain, never in UserDefaults or a file.
//
// The service and account below must match targets/widget/ShortcutIntents.swift.
private let backgroundWaterService = "com.sparkyapps.sparkyfitness.backgroundWater"
private let backgroundWaterAccount = "config"

/// The Keychain group the app shares with the widget extension, so Lock Screen
/// and Control Center controls can read the copy. Filled in at build time from
/// Info.plist; nil in a build without it, where only the app can read it.
private func sharedKeychainGroup() -> String? {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "SparkyKeychainGroup") as? String,
          !group.isEmpty, !group.contains("$(") else { return nil }
    return group
}

public class BackgroundWaterModule: Module {
    public func definition() -> ModuleDefinition {
        Name("BackgroundWater")

        Function("setConfig") { (json: String?) -> Bool in
            let match: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: backgroundWaterService,
                kSecAttrAccount as String: backgroundWaterAccount,
            ]
            // Remove any copy from before the shared group existed, then the
            // current one.
            SecItemDelete(match as CFDictionary)
            var current = match
            if let group = sharedKeychainGroup() {
                current[kSecAttrAccessGroup as String] = group
                SecItemDelete(current as CFDictionary)
            }
            guard let json, let data = json.data(using: .utf8) else { return true }
            var add = current
            add[kSecValueData as String] = data
            // Readable after the first unlock so a Shortcut run from the lock
            // screen still works; never copied to other devices.
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            if SecItemAdd(add as CFDictionary, nil) == errSecSuccess { return true }
            // The shared group needs the Keychain Sharing entitlement in the
            // provisioning profile. Without it the add is refused, and the
            // app-only copy still keeps the Shortcuts actions working.
            if current[kSecAttrAccessGroup as String] != nil {
                var appOnly = match
                appOnly[kSecValueData as String] = data
                appOnly[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                return SecItemAdd(appOnly as CFDictionary, nil) == errSecSuccess
            }
            return false
        }

        /// Asks Control Center and the Lock Screen to read the numbers on the
        /// controls that show one again. `WidgetCenter` reloads widgets only;
        /// controls have their own call, so without this a control keeps the
        /// number it was first shown with.
        Function("reloadControls") { (kinds: [String]) in
            if #available(iOS 18.0, *) {
                for kind in kinds {
                    ControlCenter.shared.reloadControls(ofKind: kind)
                }
            }
        }
    }
}
