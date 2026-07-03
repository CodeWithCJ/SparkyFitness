# Mobile App Release Guide

This guide explains how to prepare your app for production using **GitHub Actions (Android)** and **EAS (iOS)**.

---

## Part 1: Android (GitHub Actions)

You do **NOT** need to build manually. GitHub will do it for you.
However, you **MUST** do this one-time setup so GitHub has permission to sign your app.

### Step 1: Generate Release Key (One Time)
Run this command on your computer to create your private signature file.
*   **Password**: Remember the password you choose!
*   **Storage**: Keep the `.keystore` file safe.

```bash
keytool -genkey -v -keystore android/app/my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### Step 2: Configure Secrets in GitHub
GitHub needs your key and passwords to sign the app.
1.  Go to your GitHub Repo -> **Settings** -> **Secrets and variables** -> **Actions**.
2.  Add these 4 secrets:

| Secret Name | Value |
| :--- | :--- |
| `RELEASE_KEY_ALIAS` | `my-key-alias` (or whatever you chose) |
| `RELEASE_KEY_PASSWORD` | The password you typed in Step 1 |
| `RELEASE_STORE_PASSWORD` | The password you typed in Step 1 |
| `KEYSTORE_BASE64` | Run the command below to get this value: |

**Command to get KEYSTORE_BASE64 string:**
*   **Mac/Linux**:
    ```bash
    base64 -i android/app/my-release-key.keystore | pbcopy
    ```
    (The long string is now in your clipboard. Paste it into GitHub).

### Step 3: Trigger the Build
1.  Check in your code (`git push`).
2.  Create a **Release** in GitHub (tag starting with `v`, e.g., `v1.0.0`) OR just push if your workflow is set to run on push.
3.  GitHub Actions will build the APK/AAB and attach it to the Release.

---

## Part 2: iOS (EAS Build)

We use Expo's cloud service (EAS) to build for iOS because it handles Apple Certificates automatically.

### Step 1: Install EAS CLI
```bash
npm install -g eas-cli
eas login
```

### Step 2: Build for App Store
Run this command. It will ask for your Apple ID credentials the first time.
```bash
eas build --platform ios --profile production
```
*   **Result**: It will give you a link to download the `.ipa` file or automatically upload it to "App Store Connect" (if configured).

### Step 3: Upload to App Store
If the build didn't auto-submit:
```bash
eas submit -p ios
```

---

## Part 3: Install on iPhone (Offline / 7-Days)

By default, `npx expo run:ios` builds a **Debug** version that needs your Mac to be running (Metro Server). If you walk away from your Mac, the app will crash.

**To install a Standalone version (Works Offline/Away from Mac):**
Run this command:
```bash
npx expo run:ios --configuration Release --device
```
*   **Benefits**: Runs offline. Faster performance.
*   **Limitation**: Valid for 7 days (Free Developer Account) or 1 year (Paid Account).

---

## Appendix: Manual Gradle Config (Reference)
*This is already set up in your code, but here for reference in case files get reset.*

**android/gradle.properties**:
```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=my-secret-password
MYAPP_RELEASE_KEY_PASSWORD=my-secret-password
```

**android/app/build.gradle**:
Uses the variables above to sign the release.
