# Writing to Apple Health and Health Connect

Besides reading from Apple Health (iPhone) and Health Connect (Android), the mobile app can write what you log in SparkyFitness back to them, so other health apps see it too. Each kind of data has its own switch, and all of them are off until you turn them on.

## Turning it on

Open **Settings → Health Sync** and find **Write to Apple Health** (iPhone) or **Write to Health Connect** (Android). Turn on what you want to send. The phone asks for permission to write that kind of data; if you decline, the switch turns itself off again. You can change the permissions later in the Health app (iPhone) or the Health Connect app (Android).

## What each switch writes

| Switch                               | What is written                                                                                                                                                                                                          | iPhone | Android |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------- |
| **Nutrition**                        | Each food you logged, with its calories and the nutrients you allowed, at the time you logged it. On iPhone each food is grouped as one food item with its meal.                                                         | yes    | yes     |
| **Hydration**                        | Each drink you logged, at its time. If you count water from food toward your intake, that amount is added once per day at noon.                                                                                          | yes    | yes     |
| **Exercise**                         | One workout per session, with active calories and distance. See [Sending Workouts to Health Apps](/features/exercises/workouts-to-health).                                                                               | yes    | yes     |
| **Toothbrushing**                    | Each brush you logged or timed, with its duration. Health Connect has no record for it.                                                                                                                                  | yes    | no      |
| **Weight**, **Body Fat**, **Height** | The day's value from your check-in (Measurements), at noon.                                                                                                                                                              | yes    | yes     |
| **Waist Circumference**              | The day's waist from your check-in, at noon. Health Connect has no record for it.                                                                                                                                        | yes    | no      |
| **Bone Mass**, **Body Water Mass**   | The day's value from your check-in, at noon. Body water is stored as a percentage, so it is written as that share of the same day's weight, and not at all on a day with no weight. Apple Health has no type for either. | no     | yes     |

Only things you logged in SparkyFitness are written. Data that came into SparkyFitness from Apple Health, Health Connect, Garmin, Strava or any other connected service is never sent back, because it is already recorded where it came from. Readings such as steps, sleep and heart rate are not written either.

Body measurements are the exception: the check-in keeps one value per measurement per day and does not record where it came from, so SparkyFitness cannot tell a weight you typed in from one a smart scale's app sent through Apple Health or Health Connect. To avoid a second copy, a day is skipped when another app already recorded the same value on it (this check needs read access to that measurement, which turning the switch on asks for). Even so, if another app already supplies a measurement, leave its switch off. Neck, hips, muscle mass and BMR are not written: there is no matching record type, or another app would count it toward calories burned.

## When it is written

Writing happens during each sync, in the background or when you open the app. Body measurements have no time of day in SparkyFitness, so they are written at 12:00 on their day, and today's value goes out on the first sync after noon. When you turn a switch on, yesterday and today are written. After that, each sync writes the days since the previous one, starting the day before it: if you sync every day, that is yesterday and today; after a few days without syncing it catches up on up to seven days.

Editing or deleting something in SparkyFitness replaces or removes its copy on the next sync, but only if its day is in that window. Changes to older days are not sent. A day with no changes is skipped, and a day is never written twice: its earlier copy is replaced.

## Using two phones

If you use SparkyFitness on an iPhone and an Android phone with the same account and turn writing on for both, each phone writes what you logged in SparkyFitness to its own store. Data the iPhone reads from Apple Health does not reach Health Connect, and the other way round. Body measurements are the exception: a weight that a scale app sent to Apple Health is read into your check-in, and the Android phone, whose check-in is the same, writes it to Health Connect if its Weight switch is on. If you do not want it there, turn the Weight switch off on the Android phone; turning it off on the iPhone does not stop the iPhone from reading the scale's weight.

## Duplicates

For activity data, such as active energy and distance, Apple Health and Health Connect merge overlapping values from different apps when they work out daily totals, using the app order in their settings, so a workout written by SparkyFitness does not double a daily total there. Food and drink are not merged that way: if the same meal or drink reaches the store from two apps (for example you log it in SparkyFitness and in another food app), both count. Log each food or drink in one place, or turn off writing in one of the apps.

SparkyFitness itself skips what it wrote when it reads from Apple Health or Health Connect again, so nothing comes back as a second entry.

## In the Health app

Written data is listed under the app that wrote it, **SparkyFitness**. A development build shows as **DevSparkyFitness**, so its data can be removed without touching the regular app's.

## Removing what was written

**Remove from Apple Health** / **Remove from Health Connect** on the same screen deletes what SparkyFitness wrote, for a date range or for all time. It deletes only SparkyFitness's own records, never other apps' or the Apple Watch app's. Removing all time also turns writing off. Your SparkyFitness diary is not affected.
