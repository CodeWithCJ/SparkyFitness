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

Keep the phone app signed in so it can sync your account settings and credentials to the watch. On Wear OS, once the phone has shared your server credentials, the watch can also sync directly with your server over Wi-Fi or LTE (Watch → Server) to refresh today's figures and save water, medication doses, weight check-ins and fasting changes right away, falling back automatically to the paired Android phone whenever the server cannot be reached directly (and notifying the phone to refresh its own cache when in range). If a client certificate (mTLS) is configured in the Android app, the phone does not share server credentials with the watch, so the watch routes server access through the paired Android phone even when the watch has Wi-Fi or LTE. Apple Watch queues actions whenever the paired iPhone is unreachable, while Wear OS queues them on the wrist only when neither direct Watch → Server nor the paired Android phone can be reached, delivering them once connectivity returns (queued Wear OS hydration actions are eligible for replay only on the day they were logged).

## Pages

Swipe between pages on the watch. Choose which pages show, and in what order, on the phone under **Settings → Apple Watch** (or **Settings → Wear OS** on Android). The menu only appears while a watch is paired, and the last page can't be turned off. Pages of features turned off in **Settings → Features** are not listed there.

| Page | What it does |
| --- | --- |
| **Goals** | Calorie ring plus the nutrients you pick (protein, carbs and fat by default). |
| **Water** | Add a drink with one tap, see today's total against your goal (with the amount that comes from food, when that is on), and remove a drink you added by mistake. |
| **Medications** | Today's scheduled doses and your as-needed medications; log a dose from the wrist. While Medications is turned off in the app's **Settings → Features**, this page leaves the watch (Goals shows if it was the only page) and the Wear OS Medications tile and complication say it is turned off. |
| **Weight check-in** | Enter today's weight (and optional body fat %) from the wrist. |
| **Weight trend** | A chart of your recent weight. On Wear OS, one body-fat reading enables the dual Weight + Body Fat % summary card and the **Weight** / **Body Fat** chart selector so smart-scale body fat stays visible even when the Weight check-in page is hidden, while the Body Fat trend curve requires at least two dated readings within the 14-day chart window. |
| **Workout** | Start a saved workout preset or a walk or run, and log it live. |
| **Fasting** | See the running fast, start a 16:8, 18:6 or 20:4 fast, or end it. |
| **Steps** | Today's steps against the goal. |

The settings screen also picks which nutrients the Goals page lists, and:

- **Ask for effort (RPE) after each set**: off by default. When on, logging a set holds it behind a quick effort rating (1–10 on Apple Watch, 5–10 on Wear OS, or 1–10 in the new workout view).
- **Apple Watch only:** double-tap to tick a set (watchOS 11 and a watch that supports it), and a **Set input** choice between a keypad and adjusting weight and reps with the Digital Crown.

## Workouts

Start a saved workout from the phone, or from the Workout page on the watch. The watch walks you through each set with its target weight and reps, runs the rest timer, shows your live heart rate and calories, and sends each logged set to the phone. Supersets, timed holds, carries and bodyweight exercises are supported; you can add or remove sets and exercises from the wrist. When the workout ends, the summary asks how hard it was. See [Workout effort](/features/exercises/workout-effort).

Walks and runs can be recorded on the watch alone with **Cardio**: outdoors with the watch's GPS or indoors on a treadmill. Training-program workouts can be followed on the watch, with pace and heart-rate alerts and buzzing or spoken cues. See [GPS activity recording](/features/exercises/gps-activity-recording) for the full behavior, including the Apple Watch details.

**Apple Watch only:** a saved route can be followed (and kept on the watch) during an outdoor run. See [Following a Route on Apple Watch](/features/exercises/route-following-on-watch).

## Wear OS tiles

Wear OS includes six Material 3 Expressive tiles (**Nutrition**, **Hydration**, **Medications**, **Sleep**, **Exercise** and **Weight**) with an outer progress ring, tonal cards or button groups, and a curved bottom edge button (smaller watch screens may omit the bottom edge button on the Nutrition and Sleep tiles when showing three rows). Tapping a tile's header, ring or bottom action opens the matching page in the watch app (or cycles pages inline when paginated):

- **Hydration tile:** shows your primary water container and Quick Add drink presets first, using full-width rows when 1–2 presets are configured and a 2×2 one-tap grid for 3 or more so you can log water or drinks directly from the tile without opening the app (duplicate colliding labels open the Water page instead so you can pick the exact preset). When more than four containers or Quick Add drinks are configured, the curved bottom **More** edge button cycles pages inline on the tile.
- **Medications tile:** shows 1–2 daily doses as full-width tonal cards and switches to a 2×2 grid when 3 or more daily doses are scheduled, with inline **More** edge-button page cycling beyond four doses and one-tap dose check-off directly from the tile when each dose strength fits unambiguously (clipped or duplicate entries open the Medications page instead; active while **Settings → Features → Medications** is on).
- **Weight, Sleep, Nutrition and Exercise tiles:** summarize today's progress at a glance with a curved bottom shortcut button; tapping the Weight sparkline opens **Weight trend** when that page is enabled (or the tile's main page when hidden).

## Complications

Add these to a watch face for a one-tap glance that opens the matching page.

### Apple Watch

| Complication | What it shows | Sizes |
| --- | --- | --- |
| **Daily Energy Goal** | Calories as an inner ring, with protein, carbs and fat as an outer ring. In the corner, the rings sit beside a curved row of the four percentages. | Circular, corner |
| **Calorie Goal** | Just calories, as a percentage of your goal. | Circular, corner |
| **Protein Goal**, **Carbs Goal**, **Fat Goal** | One macro against its goal. | All four |
| **Water Intake** | Today's water against your goal. | Circular |
| **Fasting** | The running fast. | All four |
| **Steps** | Today's steps against the goal. | All four |
| **Custom Complication** | Anything you set up yourself, see below. | All four |

The four sizes are circular, corner, rectangular and inline.

### Change a built-in's colour and icon

On the phone, open **Settings → Apple Watch → Complications** (or **Settings → Wear OS → Complications** on Android) and scroll to **Built-in complications**. Tap Calorie Goal, Protein Goal, Carbs Goal, Fat Goal, Water Intake, Fasting or Steps, then pick a colour and an icon. **Put back the original look** undoes it. What each one shows stays the same, and a face that already uses it keeps working. On Apple Watch, Daily Energy Goal has a colour for each part it draws (the calorie ring, protein, carbs and fat) and no icon; **Put back the original colours** undoes it. For different numbers or layouts, make a custom complication instead.

### Make your own (Apple Watch and Wear OS)

On the phone, open **Settings → Apple Watch → Complications** (or **Settings → Wear OS → Complications** on Android). Add as many as you like, and for each one choose:

- **What it shows.** Calories (eaten, left or burned), protein, carbs, fat, water, steps, fasting time, weight, body fat, any nutrient you show on the Goals page, sleep (time, score, deep, REM and light sleep, time in bed), resting heart rate, overnight HRV, blood oxygen, exercise minutes, exercise calories, and workouts today. Sleep and exercise appear once the phone has that day's data.
- **How it is written.** The value, the percentage of its goal, or what is left to reach it. A value with no goal, such as sleep time, can only show itself. The sleep score is out of 100, so it can show a percentage and fill a gauge.
- **A gauge**, a **color** and an **icon**.
- **More values.** A complication can show up to three values together: concentric rings in the circular/corner sizes (or small image slot on Wear OS), a row for each in the rectangular size, and the values joined on one line inline or in long-text slots. The editor previews the layouts as you change things.

The list starts with four ready-made ones: Calories left, Macros (protein, carbs and fat as three rings), Weight and Sleep score. Changing or adding one makes the list yours. **Reset to starters**, **Export** and **Import** are in the menu at the top right: Export saves your list as a file, and Import adds the complications in a file to your list or replaces it.

To use one, edit the watch face, tap a complication slot and choose **Custom Complication** (on Apple Watch) or **Sparky Custom** / **Sparky Custom Gauge** (on Wear OS), then pick one of yours. Put different ones in different slots.

The watch keeps its own copy of the list and remembers the picker. If a change doesn't show up there, tap **Reload complications** at the bottom of the Complications screen. It sends the list to the watch again and makes the watch refresh the picker and every face.

### Wear OS

Wear OS offers built-in complications for Calories, Calories Left, Protein, Carbs, Fat, Water, Fasting, Steps, Sleep, Medications, Exercise and Weight, plus **Sparky Custom** (for any custom complication — values, text, or multi-value rings) and **Sparky Custom Gauge** (for goal-backed custom complications with a watch-face progress arc). Selecting either one on a watch face opens the picker on the watch to choose which saved complication that slot displays.

## Troubleshooting

- **Nothing updates on the watch:** open the phone app once so it can push fresh data, and make sure the phone is signed in and connected to your server.
- **The Apple Watch or Wear OS item is missing from Settings:** the phone only lists it while a watch with the SparkyFitness app is paired.
- **The Custom Complication picker is empty, or doesn't show my complications (Apple Watch):** open the SparkyFitness app on the phone and on the watch once, with the watch in range, so the phone can send your list. Until it arrives the picker offers the starter set. If the picker still shows an old name or list, tap **Reload complications** on the phone's Complications screen.
- **A custom complication shows a dash:** the watch doesn't have that value for today yet, for example last night's sleep before the phone has synced it. Open the phone app and give it a moment.
- **A workout didn't appear in the diary:** the finished workout is delivered to the phone when it is in range. Open the phone app and give it a moment.
