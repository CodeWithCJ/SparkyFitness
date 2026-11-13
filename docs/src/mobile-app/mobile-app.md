# Mobile App

The Mobile App is available for both iOS and Android devices. It allows you to sync your data from Apple Health or Android Health Connect. It also provides a convenient way to access Sparky Fitness on the go.

**Mobile App requires HTTPS**, though support for self-signed certificates has been added. Since the app handles health data, HTTPS is required for the app to be allowed to be published on the Google Play Store. See the [Google Play Policy Center](https://support.google.com/googleplay/android-developer/answer/10144311) for more information.

## iOS

The iOS version of the Sparky Fitness app is available on the App Store.

[Get it here](https://apps.apple.com/us/app/sparkyfitness/id6757314392)

### Testflight

Join the Testflight beta program to get early access to new features and updates:

[Join Testflight](https://testflight.apple.com/join/9Yz8PzpR)


## Android

### Install APK

You can download the latest APK from our [GitHub releases page](https://github.com/CodeWithCJ/SparkyFitness/releases). Look for the latest release and download the `app-release.apk` file. Then transfer it to your android device for installation. The `wearos-release.apk` file is for watches; see [Installing the Wear OS app](/mobile-app/watch-apps#installing-the-wear-os-app).

::: warning Updating from v1.10.0 or earlier
GitHub APKs after v1.10.0 are signed with a new key, so Android won't update an older GitHub install over the top. Uninstall the app, install the new APK, and sign in again. Uninstalling removes what is stored only on the phone, including your server setup and anything not yet synced, so sync first. Google Play installs aren't affected.
:::

### Google Play Beta

The Android version is available as a google play store beta. You can join the beta program to get early access to new features and updates:

1. First, join the [Google Play beta group](https://groups.google.com/g/sparkyfitness)
2. Then you will have access to closed testing and can [download the beta here](https://play.google.com/store/apps/details?id=com.SparkyApps.SparkyFitnessMobile)

### Health Connect sync

Overnight HRV and resting heart rate appear on sleep entries when HRV and Resting Heart Rate sync are enabled.

## Watch apps

The mobile app has companion apps for Apple Watch and Wear OS. See [Watch Apps](/mobile-app/watch-apps).

## Screenshot (iOS)

![Mobile App](/appdashboard.png)
