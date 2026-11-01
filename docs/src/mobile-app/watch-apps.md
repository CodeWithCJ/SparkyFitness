# Watch Apps (Apple Watch and Wear OS)

SparkyFitness has a companion app for **Apple Watch** (watchOS) and for **Wear OS** watches. Both follow your phone: they show today's goals, log water, weight, fasting and medications from the wrist, and run workouts that are saved to your diary. The phone must be signed in to your server.

## Setting up

- **Apple Watch:** pair the watch with your iPhone. The SparkyFitness watch app comes with the iPhone app.
- **Wear OS:** the watch app is a separate install that needs the Android app on the paired phone. See [Installing the Wear OS app](#installing-the-wear-os-app). Open it on the watch once so it can reach the phone.

### Installing the Wear OS app

Each [GitHub release](https://github.com/CodeWithCJ/SparkyFitness/releases) after v1.10.0 carries `wearos-release.apk` beside the phone's `app-release.apk`. It is for watches, so don't install it on your phone. Watches have no file installer, so use `adb` from a computer:

1. On the watch, turn on Developer options and then **Wireless debugging**.
2. Under **Pair new device**, note the pairing address and code. On the computer, run `adb pair <pairing-address>:<pairing-port>` and enter the code when asked.
3. Back on the Wireless debugging screen, note the watch's own address and port, which are different, and run `adb connect <address>:<port>`.
4. Run `adb install wearos-release.apk`.

Install the phone and watch apps from the same place. Only apps signed with the same key can talk to each other, and the GitHub and Google Play builds use different keys, so a GitHub watch app won't connect to a Google Play phone app. Use a phone APK from the same or a later release, because GitHub APKs up to v1.10.0 used a different key.

If you use Obtainium, a release now has two APKs. Choose `app-release.apk` for your phone, or filter on it in the app's settings.

The watch gets everything from the phone, so keep the phone app signed in. If the phone is out of range, check-ins you make on the watch (water, weight, fasting, doses, finished sets) are queued and normally delivered when it is back. If a delivery fails, open the app on both devices and try again.

## Pages

Swipe between pages on the watch. Choose which pages show, and in what order, on the phone under **Settings → Apple Watch** (or **Settings → Wear OS** on Android). The menu only appears while a watch is paired, and the last page can't be turned off.

| Page | What it does |
| --- | --- |
| **Goals** | Calorie ring plus the nutrients you pick (protein, carbs and fat by default). |
| **Water** | Add a drink with one tap, see today's total against your goal (with the amount that comes from food, when that is on), and remove a drink you added by mistake. |
| **Medications** | Today's scheduled doses and your as-needed medications; log a dose from the wrist. |
| **Weight check-in** | Enter today's weight from the wrist. |
| **Weight trend** | A chart of your recent weight. |
| **Workout** | Start a saved workout preset or a walk or run, and log it live. |
| **Fasting** | See the running fast, start a 16:8, 18:6 or 20:4 fast, or end it. |
| **Steps** | Today's steps against the goal. |

The settings screen also picks which nutrients the Goals page lists, and:

- **Ask for effort (RPE) after each set**: off by default. When on, logging a set holds it behind a quick effort rating (1–10 on Apple Watch, 5–10 on Wear OS).
- **Apple Watch only:** double-tap to tick a set (watchOS 11 and a watch that supports it), and a **Set input** choice between a keypad and adjusting weight and reps with the Digital Crown.

## Workouts

Start a saved workout from the phone, or from the Workout page on the watch. The watch walks you through each set with its target weight and reps, runs the rest timer, shows your live heart rate and calories, and sends each logged set to the phone. Supersets, timed holds, carries and bodyweight exercises are supported; you can add or remove sets and exercises from the wrist. When the workout ends, the summary asks how hard it was. See [Workout effort](/features/exercises/workout-effort).

Walks and runs can be recorded on the watch alone with **Cardio**: outdoors with the watch's GPS or indoors on a treadmill. Training-program workouts can be followed on the watch, with pace and heart-rate alerts and buzzing or spoken cues. See [GPS activity recording](/features/exercises/gps-activity-recording) for the full behavior, including the Apple Watch details.

**Apple Watch only:** a saved route can be followed (and kept on the watch) during an outdoor run. See [Following a Route on Apple Watch](/features/exercises/route-following-on-watch).

## Complications

Add these to a watch face for a one-tap glance that opens the matching page:

- Calories, Protein, Carbs and Fat goals
- Water
- Fasting
- Steps

Apple Watch has Protein, Carbs, Fat, Fasting and Steps complications in circular, corner, rectangular and inline sizes. Wear OS offers Calories, Protein, Carbs, Fat, Water, Fasting and Steps.

## Troubleshooting

- **Nothing updates on the watch:** open the phone app once so it can push fresh data, and make sure the phone is signed in and connected to your server.
- **The Apple Watch or Wear OS item is missing from Settings:** the phone only lists it while a watch with the SparkyFitness app is paired.
- **A workout didn't appear in the diary:** the finished workout is delivered to the phone when it is in range. Open the phone app and give it a moment.
