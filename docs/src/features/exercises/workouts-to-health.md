# Sending Workouts to Apple Health and Health Connect

The mobile app can write the workouts you log in SparkyFitness to Apple Health on iPhone and to Health Connect on Android, so other apps (and the Fitness app on iPhone) see them. For writing nutrition, water and the rest, see [Writing to Apple Health and Health Connect](/mobile-app/health-writeback).

## Turning it on

Open **Settings → Health Sync**, and under **Write to Apple Health** (iPhone) or **Write to Health Connect** (Android) turn on **Exercise**. You are asked for permission to write workouts (exercise sessions), active energy and distance, and to read workouts. The read access is used only to check that a workout is not already there before writing it; on Android nothing is written without it.

Writing happens during each sync. When you turn it on, yesterday and today are written. After that, each sync writes the days since the previous one, starting the day before it: if you sync every day, that is yesterday and today; after a few days without syncing it catches up on up to seven days. Editing or deleting a workout updates or removes its copy on the next sync only if the workout's day is in that window, so changes to older workouts are not sent. The same goes for changing an exercise's **Health activity type**: it reaches the workouts written from then on.

## What is written

- **One workout per session.** A single activity (a walk, a run) becomes one workout. A strength session with several exercises becomes one workout for the whole session, the way the Apple Watch records strength training.
- **Sets as segments (Health Connect).** On Android each set you logged with a start and finish time becomes a segment of the session, with its exercise (bench press, squat, curl and so on) and reps. Exercises Health Connect has no name for are listed as "other". Apple Health has no place for sets.
- **Activity type.** Chosen from the exercise's name and category, for example Walking, Running (indoor for a treadmill), Strength Training or Yoga. Health Connect has fewer types than Apple Health, so a few activities (archery, bowling, pickleball and others) are written there as "Other workout". To pick it yourself, edit the exercise and set **Health activity type**. This works for your own exercises too: a custom "Walking into Mordor" set to Walking is written as a walk.
- **Time.** The workout's start time and duration. An entry logged without a time is placed at noon on its day.
- **Active energy.** The calories you logged, minus what your body burns at rest over that time, because Apple Health counts only the extra calories from activity. Calories measured by a watch are written as they were measured.
- **Distance**, when the entry has one. On iPhone this covers walking, running, cycling, swimming, wheelchair and snow sports (rowing, paddling, skating and cross-country skiing need iOS 18); Health Connect takes distance for any activity.
- **A sets summary**, such as "Bench Press 3×10 @ 60 kg", in the workout's details (the session's notes on Health Connect). Neither store has a field for weight, so that stays in SparkyFitness. Your own notes are never written.

Steps are not written: your phone and watch already count them.

## What is not written

- Workouts that came from Apple Health, Garmin, Strava or any other connected service. They are already recorded by that service, and writing them again would duplicate them.
- Workouts recorded with the SparkyFitness Apple Watch app. The watch already saves them to Apple Health. (The Wear OS app does not write to Health Connect.)
- A workout you linked to a synced watch workout (see the calorie link on the workout), because it is the same workout.
- A strength session that is still in progress.
- Any workout when another app or watch already saved a workout covering most of the same time. The skip is noted in the app logs.

## Duplicates and double counting

Apple Health and Health Connect merge overlapping energy and distance from different apps when they work out daily totals, using the app order in their settings, so writing a workout does not double your daily totals there. SparkyFitness also leaves out the energy and distance it wrote when it reads your daily totals back.

If another app copies workouts out of Apple Health or Health Connect (for example Strava's Apple Health import) and SparkyFitness also syncs from that app, the same workout can come back as a second entry. Turn off that app's import from Apple Health, or link the two entries with the calorie link so it counts once.

## Removing what was written

**Remove from Apple Health** / **Remove from Health Connect** on the same screen deletes what SparkyFitness wrote, either for a date range or for all time. It deletes only the workouts and records SparkyFitness wrote, never workouts from the Apple Watch app or other apps.
