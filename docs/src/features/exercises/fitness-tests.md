# Fitness Tests

A fitness test is one hard, measured run. Run it in the mobile app, either outdoors with your phone's GPS or indoors on a treadmill (no GPS needed), and SparkyFitness works out your threshold pace and a full set of training paces from it. Those paces then set your [pace zones](/features/exercises/gps-activity-recording#pace-zones), the suggested ranges on the Record screen, and the plans you start from the training programs screen.

Tests work outdoors with your phone's GPS and indoors on a treadmill. They are recorded as an ordinary run (an outdoor run, or an indoor run), saved to your diary, and marked as a fitness test on the activity.

## The three tests

| Test | What you do | The result |
| --- | --- | --- |
| **5K time trial** | Run 5 km as fast as you can hold evenly. | Your time to 5 km. |
| **30-minute all-out run** | Run as hard as you can keep steady for 30 minutes. Do not start too fast. | Your threshold pace: the average pace of the **last 20 minutes**. |
| **12-minute Cooper test** | Cover as much distance as you can in 12 minutes. | The distance you reach. |

Warm up with 10 to 15 minutes of easy running first, pick a flat, open route (or a treadmill) and start the test when you are ready.

## Running a test

1. Open **Library → Training programs → Take a fitness test** (or **Tests and paces** once you have a test), and tap **Start this test** on the one you want.
2. Read the short guide, choose **Outdoor (GPS)** or **Treadmill**, and tap **Start the test**. The phone records the run as it does for any run. Auto-pause is off for a test, because pauses would take time out of a timed test, and a test is always recorded on the phone, not the watch.
3. While you run, a card shows what is left (the distance to 5 km, or the time to go) and what to do now. In the 30-minute run it tells you when the last 20 minutes begin. When you reach the mark the phone buzzes, and says so with voice cues on.
4. Tap **Finish** and then **Save activity**. A result screen shows your result and your new training paces.

The rest of this section is for outdoor tests; [treadmill tests](#on-a-treadmill) are below. The result is read at the test's own mark whatever you did afterwards: the time you reached 5 km, the distance at exactly 12 minutes, or the distance at 10 and 30 minutes. Jogging on to cool down does not change it. If you stop before the mark, the run is saved as an ordinary run, the screen says so, and your paces stay as they were. Pauses do not count towards a test's time.

## On a treadmill

Choose **Treadmill** before you start. Nothing is tracked by GPS, so the test is timed by the clock and you tell the app what the treadmill showed when you finish. The retest suggestion and the surface choice start from the surface of your last test.

1. **Run the test.** The 12-minute and 30-minute tests end on the clock, and the phone buzzes at the mark. For the 5K, tap **Finish** when the treadmill reaches 5 km. In the 30-minute run, note the treadmill's distance at 10:00; the card reminds you.
2. **After Finish, confirm what the treadmill showed:**
   - **Distance** (the same box as for any indoor run, filled in from your steps when the phone can estimate it). The Cooper test and the 30-minute run need it; without it the run is saved as an ordinary run and the screen says so. The 5K does not need it: it is logged as 5 km.
   - **Time to 5 km** (5K only). Your clock time is filled in; change it if the treadmill showed another time at 5 km. Type it as minutes and seconds, like 24:30.
   - **Distance at 10:00** (30-minute run only), the treadmill's distance after 10 minutes, which is what sets the threshold pace. Leave it empty to assume a steady pace, a third of the total at that point.
   - **Incline**, as a percent from 0 to 15. It starts at 1%. Clear it if you do not know the incline.
3. A test stopped before the end of the clock is saved as an ordinary run, as outdoors.

### The incline correction

A treadmill at 0% is easier than the same speed outdoors, because there is no air to push against. Running 1% uphill makes up for that, so **1% is about the same as running flat outdoors**. A steeper treadmill is harder than flat ground, and a flatter one easier.

When you enter an incline, the app counts your effort the way it would count it on a flat outdoor course, using the oxygen cost of each metre run from the ACSM running equation (0.2 plus 0.9 for each 100% of grade, compared with the cost at 1%):

| Incline | Your speed counts as |
| --- | --- |
| 0% | about 4% slower (x 0.957) |
| 1% | unchanged |
| 2% | about 4% faster (x 1.043) |
| 3% | about 8.6% faster (x 1.086) |
| 5% | about 17% faster (x 1.172) |

So a Cooper test of 3,000 m at 3% incline counts as about 3,258 m, and a 25:00 5K at 3% counts as about 23:00. The 5K's time is divided by the factor; the other tests' distances are multiplied by it. It is a rule of thumb for steady running, not a measurement, so treat it as an estimate.

The screen shows both numbers: "Adjusted for 3% incline: 3,000 m counts as 3,258 m." The saved test keeps what you measured and says it was adjusted. **Adjust for incline** is a switch; turn it off to use the numbers as they are. Nothing is adjusted when you leave the incline empty or enter 1%.

Every test is marked **Outdoor** or **Treadmill** (with its incline and whether it was adjusted) on the result, in the history list and on the activity.

## How the paces are worked out

- **Threshold pace** is the pace you could hold for about an hour. For the 5K it comes from your time by Riegel's formula carried to an hour. A Cooper distance is first turned into the 5K time it points to (Riegel's formula again, from 12 minutes), then into a threshold pace. For the 30-minute run it is the average pace of the last 20 minutes, as above.
- The five **pace zones** (Easy, Steady, Threshold, Interval, Repetition) are built around the threshold pace, in your distance unit.
- The test is also turned into an equivalent 5K time, which gives the tempo, marathon-pace and stride ranges as well.

The numbers are worked out on the server from your measurements, so the phone, the web app and the AI assistant always agree. They are estimates, not a lab test: heat, hills and a bad day change them.

## What the paces change

Your latest test beats any estimate made from your recent runs:

- **Pace zones** in Exercise Statistics → Cardio say they were set by your latest test.
- **Suggested ranges** on the Record screen (fast and easy stretches, warm-up and cool-down, tempo, marathon pace and strides) are built from the test, and say which test.
- Your latest test is also used in place of a race time you typed under **Your race pace** while you have one. Delete your tests and the typed race time is used again.

## Starting a plan from your test

On the training programs screen the **Your fitness test** card shows your latest test and the paces it set.

- **Start … from my test** starts the built-in program the 5K time points to: *5K to 10K* for a 5K slower than 35 minutes, *Faster 5K* from 26 to 35 minutes, and *Faster 10K* for a quicker 5K. You are asked when the first workout is, as for any program, and can pick another program yourself.
- **Plan a race** opens the race planner with **Plan from my latest test** on. It sets your starting level from the test and plans race day at the pace the test points to for that distance, instead of asking how much you run. Switch it off to choose a level by hand.

## Retesting

Fitness changes, so a retest is offered when your latest test is **six weeks old**: on the training programs screen, and on the Diary's program card while you follow a program (**Later** puts it off until the app is next opened). The offer says which surface your last test was on, and the new test starts on the same one; you can change it before you start. From eight weeks the offer says your paces may be out of date.

After a retest, the result screen shows **how your paces changed** since the test before: the threshold pace and each zone, as "12 s/km faster" or "slower". Open any earlier test from the history to see its own comparison.

## History

**Training programs → Tests and paces** lists your latest ten tests with the date, the result, whether it was outdoors or on a treadmill, and the paces each one gave (threshold and easy range). Tap one to open its result, the full paces and the change since the test before. A test can be deleted from its screen: the activity stays in your diary, and your paces follow your latest remaining test.

On an activity that was a test (in the diary, from Exercise Statistics), a **Fitness test** card under the date gives the result.

## On the web

Reports → Exercise → **Cardio** shows a **Fitness tests** card above the running trends: your latest result, your training paces, a short list of earlier tests and, from six weeks, a reminder to retest in the mobile app. It is read-only; tests are recorded on the phone.

## Ask the assistant

The AI assistant can read your tests (the **get_fitness_tests** action of the run program tool): your latest results (outdoor or treadmill, with the incline), your paces and whether a retest is due. It does not change them. Read-only API keys can use it too.

## Privacy

Your tests and paces are personal training data. They are visible only to you: never shared with family or friends, and not available while you act on behalf of someone else. See [Family & Friends Sharing](/features/family-friends-sharing).
