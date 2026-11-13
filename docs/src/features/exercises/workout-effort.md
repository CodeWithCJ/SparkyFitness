# Workout Effort

Workout effort is how hard a workout felt, from 1 (easy) to 10 (maximal). It is the same rating Apple asks for after a workout, and SparkyFitness keeps it with the workout so you can see it later.

## Where the rating comes from

| Where you rate | What happens |
| :--- | :--- |
| The **SparkyFitness Watch app**, on the summary screen after a strength workout or a walk or run recorded on the watch | Saved to the workout in the diary and, on watchOS 11 or later, to Apple Health as the workout's effort score |
| **Apple Health**, for a workout recorded by another app or by the Apple Workout app (rated on the watch or in the Fitness app) | Read in on the next health sync and shown on the matching diary entry |

The Watch app asks "How hard was that?" on the summary screen. The number starts at 5 and sits on a card like the weight and reps cards on the set screen: tap it to select it, turn the Digital Crown to change it, and tap it again to hand the crown back to scrolling. Until you tap the card the crown scrolls the page, so reading down the summary never changes the rating. Under the number is Apple Health's word for it: Easy (1 to 3), Moderate (4 to 6), Hard (7 to 8) or All Out (9 to 10). Tap **Save** to keep the rating, or tap **Done** to skip it.

Only a rating you gave is read from Apple Health. Apple's automatic estimate is ignored, so a workout you did not rate shows no effort.

## Where you see it

- **Mobile:** the summary on a strength workout's detail screen, the stats on an activity's detail screen, and the stats on a cardio session.
- **Web:** the stats strip on a strength session in the diary, and the stats row on a single activity.

A strength workout stores the same rating on every exercise in the session, so it reads the same whichever exercise you open.

## Training programs

When a run recorded on the watch completes a training-program workout, its rating also counts as that workout's "How hard was that?" answer. That answer drives the program's suggestions to repeat a hard workout or skip ahead after an easy one, so you no longer need to answer it in the diary afterwards.

## Good to know

- Ratings from the Watch app need the watch and phone to reach each other. If the phone is out of range the rating is delivered when it is back, and filed once the workout is in the diary. If the phone app is not running when the rating arrives for a program run, the diary still asks for it as before.
- Reading ratings from Apple Health needs permission for them. After updating, SparkyFitness asks for Apple Health access once more on the next launch; only the new rating item is new, so allow it there. If you decline, everything else syncs as before and workouts just show no effort.
- Phone-only cardio, such as a GPS recording without a watch, has no Apple Health workout to attach a rating to, so it keeps its existing "How hard was that?" row on the run summary for program workouts and shows no effort otherwise.
- Android and Health Connect are not covered: the rating comes from Apple's workout effort score.
