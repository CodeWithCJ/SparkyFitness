# Writing to Apple Health and Health Connect

Besides reading from Apple Health (iPhone) and Health Connect (Android), the mobile app can write what you log in SparkyFitness back to them, so other health apps see it too. Each kind of data has its own switch, and all of them are off until you turn them on.

## Turning it on

Open **Settings → Health Sync** and find **Write to Apple Health** (iPhone) or **Write to Health Connect** (Android). Turn on what you want to send. The phone asks for permission to write that kind of data; if you decline, the switch turns itself off again. You can change the permissions later in the Health app (iPhone) or the Health Connect app (Android).

## What each switch writes

| Switch            | What is written                                                                                                                                                  | iPhone | Android |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| **Nutrition**     | Each food you logged, with its calories and the nutrients you allowed, at the time you logged it. On iPhone each food is grouped as one food item with its meal. | yes    | yes     |
| **Hydration**     | Each drink you logged, at its time. If you count water from food toward your intake, that amount is added once per day at noon.                                  | yes    | yes     |
| **Exercise**      | One workout per session, with active calories and distance. See [Sending Workouts to Health Apps](/features/exercises/workouts-to-health).                       | yes    | yes     |
| **Toothbrushing** | Each brush you logged or timed, with its duration. Health Connect has no record for it.                                                                          | yes    | no      |

Only things you logged in SparkyFitness are written. Data that came into SparkyFitness from Apple Health, Health Connect, Garmin, Strava or any other connected service is never sent back, because it is already recorded where it came from. Readings such as steps, sleep, heart rate and weight are not written either.

## When it is written

Writing happens during each sync, in the background or when you open the app. When you turn a switch on, yesterday and today are written. After that, each sync writes the days since the previous one, starting the day before it: if you sync every day, that is yesterday and today; after a few days without syncing it catches up on up to seven days.

Editing or deleting something in SparkyFitness replaces or removes its copy on the next sync, but only if its day is in that window. Changes to older days are not sent. A day with no changes is skipped, and a day is never written twice: its earlier copy is replaced.

## Using two phones

If you use SparkyFitness on an iPhone and an Android phone with the same account and turn writing on for both, each phone writes what you logged in SparkyFitness to its own store. Data the iPhone reads from Apple Health does not reach Health Connect, and the other way round.

## Duplicates

For activity data, such as active energy and distance, Apple Health and Health Connect merge overlapping values from different apps when they work out daily totals, using the app order in their settings, so a workout written by SparkyFitness does not double a daily total there. Food and drink are not merged that way: if the same meal or drink reaches the store from two apps (for example you log it in SparkyFitness and in another food app), both count. Log each food or drink in one place, or turn off writing in one of the apps.

SparkyFitness itself skips what it wrote when it reads from Apple Health or Health Connect again, so nothing comes back as a second entry.

## In the Health app

Written data is listed under the app that wrote it, **SparkyFitness**. A development build shows as **DevSparkyFitness**, so its data can be removed without touching the regular app's.

## Removing what was written

**Remove from Apple Health** / **Remove from Health Connect** on the same screen deletes what SparkyFitness wrote, for a date range or for all time. It deletes only SparkyFitness's own records, never other apps' or the Apple Watch app's. Removing all time also turns writing off. Your SparkyFitness diary is not affected.
