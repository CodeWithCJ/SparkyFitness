# GPS Activity Recording

Record a walk, run or ride with your phone's GPS in the mobile app. It works on both iOS and Android, and recording continues with the screen locked.

---

## Recording an activity

1. Tap **Add** → **Record Activity**.
2. Choose **Walk**, **Run** or **Ride**, then tap **Start**. The first time, allow location access while using the app.
3. While you move you'll see a live map, elapsed time, distance, average pace, current pace and elevation gain.
4. Tap **Pause** to stop the clock (for a traffic light, say) and **Resume** to carry on. Time and distance during a pause aren't counted.
5. Tap **Finish** when you're done. You'll see the route, your totals and per-km (or per-mile) splits.
6. Tap **Save activity** to add it to your diary, or **Discard** to throw it away.

You can tap **Discard** at any point, while recording or paused as well as after finishing. You'll be asked to confirm first.

If you leave the screen mid-recording, it doesn't disappear. A bar appears above the tab bar, the same as for a strength workout, with the elapsed time, distance and pace. Use it to pause or resume, or discard, and tap it to go back to the recording. A finished recording that hasn't been saved stays there too, with a check mark that opens it so you can save it.

The saved activity is an ordinary diary entry with its route, distance, elevation gain and loss, and splits. It appears in Exercise Statistics and opens in the same cardio session view as activities imported from Garmin, Apple Health or Health Connect.

Distance, pace and splits follow your distance unit (kilometres or miles).

---

## Indoor and treadmill sessions

For a treadmill or any session without GPS, choose **Indoor** under the activity before you tap **Start**. No location access is asked for and no route is recorded. You get the clock and pause and resume, and a paired Apple Watch still adds your heart rate.

When you tap **Finish**, you can enter the distance your treadmill or machine shows. It's optional: leave it empty to log just the time. The distance is used as you typed it, in your distance unit.

### Estimated distance and learning your stride

On an iPhone or Android, the distance field is filled in for you from your phone's step count and your stride length. The first time, iOS asks for Motion & Fitness access when you finish, and Android asks for physical activity access when you start. Paused time is left out.

A phone can't measure treadmill distance exactly, so treat the estimate as a starting point:

- **At first it's rough.** Until the app has learned your stride it uses a typical one, and the screen says so.
- **Change it to match your treadmill.** When you correct the distance, the app works out your stride from it and uses that next time. It learns walking and running separately, and the estimate gets closer over a few sessions. If you leave the estimate as it is, nothing is learned.
- **Outdoor recordings help too.** A saved outdoor walk or run, whose GPS distance is known, also teaches the app your stride if you've already allowed Motion & Fitness access. It never asks for access just to learn.

Your stride is kept on your phone only. If you don't allow access, or an Android phone restarts during the session, the field starts empty and you type the distance. There's no step estimate for a ride.

The saved activity is logged as **Indoor Walking**, **Indoor Running** or **Indoor Cycling**, and has no route or splits.

---

## Nothing is lost if the connection drops

Points are saved on the phone as they arrive. Nothing is sent to your server until you tap **Save activity**, so a dropped connection or a closed app doesn't lose the activity. If the app is closed mid-recording, reopen **Record Activity** to pick it back up. If saving fails, the recording stays on the phone so you can try again; retrying never logs the activity twice.

---

## Start countdown

Pick **3 s**, **5 s** or **10 s** under **Start countdown** and tapping **Start** counts down before the recording begins, so you can put the phone away and get moving. Each number is felt as a tap and, with voice cues on, spoken. **Cancel** stops the countdown without recording anything. It's off by default and remembered. The first time you record, the location permission prompt appears after the countdown.

---

## Laps and the run summary

While recording, tap **Lap** to mark a lap, for example at the end of a hard interval or at each lap of a track. It's available while the recording is running, not while paused, and a second tap within three seconds is ignored. With voice cues on, the phone says the lap number, distance and time.

When you finish, the summary lists your laps and your splits per kilometer or mile. Each row has a bar, longer for a faster one, and the fastest is labelled, so a fading last kilometer or a strong negative split is easy to see. A short final stretch is shown but never counted as your fastest.

**After you save**, a summary screen shows what the activity came to: distance, time, average pace, elevation gain and average heart rate (when you have them), the route on a map, and each split (or your laps) with its bar. For a training-program workout it also shows how far through the program you are and when the next workout falls, with a link to the program. Tap **Done** to close it.

After saving, opening the activity from Exercise Statistics shows a **Pace** chart next to the route and heart rate: pace against distance, with faster stretches higher, and your best pace above it. It works for any activity with a GPS route, including imported ones, and leaves out the time you stood still.

If you marked laps, those are what's saved with the activity, because they're the intervals you meant to compare. If you didn't, your per-kilometer or per-mile splits are saved as before.

---

## Auto-pause

Turn on **Auto-pause** before you start and the recording pauses itself when you stop (a red light, tying a shoe) and carries on when you move again. It judges speed from the GPS, so it works with the screen locked. The clock stops from the moment you actually stopped, not from when the pause was noticed, and restarts from when you began moving. A rolling start is needed to resume, so a shuffle in place won't restart it. It waits about 10 seconds when walking, 8 running and 6 riding before pausing.

A pause you make yourself is never undone automatically; only an auto-pause resumes on its own. You can resume an auto-pause by hand at any time. The choice is remembered for next time.

---

## Voice cues

Turn on **Voice cues** before you start and the phone speaks as you go: your total time and the time of the last kilometer or mile each time you complete one, and "Paused", "Auto paused" or "Resumed" when that happens. It also says your distance and time when you finish. Cues use the distance unit from your settings and the app language, and they're spoken with the screen locked and the phone's silent switch on. If you're playing music it keeps playing, and it dips while a cue is spoken when **Lower music during cues** is on.

**Suggested ranges.** When a plan is chosen, the Record screen offers starting pace and heart-rate ranges for its fast and easy stretches and for its warm-up and cool-down, with a **Use these** button. The warm-up and cool-down range is wider and easier than the easy one (about 50 to 65 percent of your estimated maximum heart rate, and a pace range that reaches down to a walk), so a gentle start does not trigger "pick it up" alerts. For a run, the pace comes from your [pace zones](#pace-zones): fast stretches use the Interval zone and easy ones the Easy zone. For a walk it comes from your last few outdoor walks of the past two months, so you need at least two of a kilometer or more. The heart rate, with a paired watch, comes from a maximum estimated from your age (set your birth date in Profile). They are only starting points, and nothing is switched on until you tap the button.

If you follow a [training program](#training-programs) and rate your workouts, the suggested paces follow how they felt: two hard ratings in a row slow every zone by 3%, and two easy ratings in a row speed them up by 1.5%. Your pace zones themselves, shown in Exercise Statistics, are not changed by ratings.
**Program calendar.** On the training programs screen, **Open the program calendar** shows every workout of your program on a month calendar: a green dot on the days you finished one and an accent dot on the one due and the ones coming, on the days your schedule puts them (a missed workout moves the rest along). Tap a day to see its workouts, or find any workout in the **All workouts** list, and tap one to open it. A finished workout shows the day, how hard it felt and a link to the run you did; the next and later ones show the date and their steps, and you can repeat a finished workout or make a later one the next.
**Your own plans.** At the bottom of the training programs screen, **Your plans** lists plans you wrote yourself. Tap **Customize this program** on any built-in program copies its workouts into a new plan of your own (named "… (my copy)", each workout titled with its week and run) that you can change freely; the original stays as it was. Or tap **Create a plan**, name it, choose run or walk, then add workouts: each is a list of timed steps (warm up, run or brisk walk, easy, cool down) that you can lengthen or shorten, add to, copy, reorder or remove, and you can give a workout a name. Work and easy steps can also have a pace range (minutes and seconds per kilometre) and a heart-rate range, which the phone and watch coach you to hold like any interval target. With voice cues on, the coach says "Workout 4. 30 minutes." as it begins and "Workout 4 of 12 done. Next up, workout 5." at the end. A plan can hold up to 364 workouts and you can keep 30 plans. **Start program** follows it like any other: the calendar, Diary days, how-hard ratings and the voice coach all work the same. Editing a plan you are following changes it from where you are, and deleting it leaves the copy you are following alone.

**Plan a race.** Tap **Plan a race** on the training programs screen, pick a distance (5K, 10K, half marathon or marathon), your level, the race date, and the days you can run. The app builds a week-by-week plan that ends on race day: easy runs, a tempo run and intervals, a weekly long run, a taper in the last weeks and a race-day workout at an easy pace. It is saved as one of your own plans and scheduled on your chosen days, so you can edit it like any other plan. If you already follow a program, you are asked before it is replaced. Plans use timed steps, and the length of each run is an estimate from your level. If you fall behind and the plan would no longer end by your goal date or race day, the program screen offers to skip the fewest of the next workouts (up to three) so it still does; the last workout is never skipped. Further behind than that, it tells you how many workouts will not fit so you can add run days or move the date.



**Your race pace.** Under **Training programs → Your race pace** you can enter a recent 5K, 10K, half marathon or marathon time (kept on your device). The Record screen then works the suggested pace ranges out from it instead of from your recent runs: easy runs, intervals (about 5K pace), tempo, marathon pace and strides each get their own range, and the card says which race it used. A stride, tempo or marathon-pace stretch in a plan is held to its own range, and hill repeats get none because pace means little uphill. The ranges come from Riegel's formula with typical training ratios, so treat them as estimates: heat, hills or a tired week change them, and effort wins when the two disagree. On an iPhone with an Apple Watch, **Also use on my Apple Watch** puts the same ranges on the program workout offered in the watch's plan list, so the watch alerts you the way the phone does (runs only).

**Coaching.** With voice cues on, the phone also coaches a plan workout: ten seconds before a step of 30 seconds or more ends it says what comes next ("Ten seconds. Next, Fast."), then counts you in with "Three. Two. One." for the last three seconds, and it calls halfway and the last minute of a workout that is long enough. Outdoors it also marks 5K, 10K, a half marathon and a marathon when you pass them, in the same breath as a split if one lands at the same moment. **Spoken updates** (off, or every 5, 10 or 15 minutes) read out your time, distance and average pace, or just the time indoors; you can change it while recording. For a training-program workout the phone also introduces it ("Week 2, run 3. 25 minutes.", with "Eased for today." when you eased it) and, once you have run every step for its full length, closes it with your progress and what is next ("Workout 4 of 27 done. Next up, Week 2, run 4."). Each split also says how much faster or slower it was than the one before. Runs recorded on the watch speak the same coaching, in English, through the watch or your headphones; the spoken-updates choice is sent to the watch when you start (or, for a run begun on the wrist, the last one you chose).

**Voice.** With voice cues on, a **Voice** card lets you choose the voice and hear it with **Test voice**. The default, **Automatic**, uses the best Premium or Enhanced voice installed on your phone for the app language, and the phone's standard voice if there is none. Better voices are a free download: on an iPhone go to Settings → Accessibility → Read & Speak → Voices (Spoken Content → Voices before iOS 18) and download a Premium or Enhanced voice for your language, then reopen the card. The same choice is used for guided workouts. Siri's own voices and Apple Fitness's coaching voices aren't available to apps, so those can't be chosen.

The setting is off by default and is remembered for next time. Cues are spoken by the phone, so use earphones or a watch speaker if you don't want them out loud.

---

## Intervals

Under **Intervals** on the Record screen, pick a timed plan before you start: a beginner run/walk (a 5-minute warm-up, 8 rounds of 1 minute of running and 1 minute 30 seconds of walking, a 5-minute cool-down), longer run/walk blocks, or speed repeats such as 3 minutes fast with 2 minutes easy. **Custom** lets you set the warm-up, the work and recovery times, the number of rounds and the cool-down, and choose whether the steps are called "Run" and "Walk" or "Fast" and "Easy".

While you record, a card shows the current step, the time left, the round and what comes next. At each change the phone buzzes, and with **Voice cues** on it tells you what to do ("Run. 1 minute."). The steps run on the recording clock, so a pause (by hand or auto-pause) holds the step where it was and a long stop does not use up the interval.

Each step also becomes a lap, so the saved activity is split into your work and recovery stretches and the pace bars show the difference. When the last step ends you hear "Intervals complete" and can carry on or finish.

### Distance repeats

Some speed sessions are set by distance rather than time: **6 × 400 m** (a 10 minute warm-up, six 400 m repeats with 1 minute 30 seconds easy between them, a 10 minute cool-down) and **5 × 1 km** (2 minutes easy between). In **Custom**, switch the work steps from **By time** to **By distance** and set the distance in 100 m steps up to 1 km and 250 m steps above that, up to 10 km.

A distance step ends when the recording has covered that distance since the step began, however long it takes. The card shows the metres left instead of a countdown, the voice cue says the distance ("Fast. 400 meters."), and on steps of 300 m or more you hear "100 meters to go" near the end. Easy and warm-up steps stay timed, and they count from the moment the distance step ended. Repeat distances are shown in metres and kilometres, as on a track. If your distance unit is miles, **Custom** also has a **Meters / Miles** switch: in miles the repeat goes up in quarter miles (0.25 to 6 mi), it is shown and spoken in miles, and the last cue is "0.1 miles to go".

Distance repeats need GPS, so they are offered outdoors only: on an indoor session they are left out of the list, and switching to Indoor drops a distance plan you had picked. The Apple Watch follows them on a wrist-only outdoor run using its own GPS distance, and shows the metres left in place of the countdown.

With an Apple Watch connected to a phone recording, the watch shows the current step, a countdown and what comes next, and buzzes when the step changes. Watch-only recordings do not follow a plan yet. On an indoor session there is no GPS feed, so the steps move on while the Record screen is open and catch up when you open it again.

---

## Training programs

Training programs are optional and off by default. Open **Library → Training programs**, read the programs and tap **Start program** on the one you want:

| Program | For | Length |
| --- | --- | --- |
| **Walk for fitness** | Not running yet. Brisk walks alternating with easy ones, building to 30 minutes of brisk walking. Recorded as a walk. | 8 weeks, 3 walks a week |
| **Brisk walk 10K** | You walk regularly and want a bigger goal. Brisk walks and a long walk building to about 1¾ hours (a 10K walk). Recorded as a walk. | 10 weeks, 3 walks a week |
| **Return to running** | Coming back after a break. One-minute runs building to about 20 minutes of running. Leave a day or two between runs and keep the pace easy; if you are returning from an injury, check with a physio or doctor first. | 4 weeks, 3 runs a week |
| **Gentle 5K** | Starting to run, slowly. Very short runs between long walks, building to 30 minutes of running. | 12 weeks, 3 runs a week |
| **Beginner 5K** | Starting to run. Alternating running and walking, building to 30 minutes of running. | 9 weeks, 3 runs a week |
| **5K to 10K** | You can run 30 minutes. Steady runs and a long run building to 65 minutes, with an easier week every fourth. | 8 weeks, 3 runs a week |
| **Faster 5K** | You already run 5K. Interval sessions, easy runs and tempo runs. | 6 weeks, 3 runs a week |
| **Beginner 10K** | Starting from walking. Run/walk building to continuous running, then runs of up to an hour. | 12 weeks, 3 runs a week |
| **Faster 10K** | You already run 10K. Interval sessions, easy runs and tempo runs of up to 30 minutes. | 8 weeks, 3 runs a week |
| **10K to half marathon** | You can run 10K. Long runs building from 65 to 115 minutes, with easier weeks and a taper. | 10 weeks, 3 or 4 runs a week (your choice) |
| **Half marathon** | You run 30 minutes comfortably. Long runs building to about 2 hours, with a taper. | 12 weeks, 3 or 4 runs a week (your choice) |
| **Faster half marathon** | You have run a half marathon. Interval sessions, tempo runs and long runs building to 110 minutes, with a taper. | 10 weeks, 3 or 4 runs a week (your choice) |
| **Beginner marathon** | You can run 10K. Long runs building to 2½ hours, an easier week every fourth and a three-week taper. | 18 weeks, 3 or 4 runs a week (your choice) |
| **Marathon** | You already run regularly. Long runs building to about 2¾ hours, an easier week every fourth and a taper. | 16 weeks, 3 to 4 runs a week |
| **Advanced marathon** | You run five days a week. Speed or tempo work, middle runs and long runs building to 3 hours, with a taper. | 16 weeks, 3 to 5 runs a week |

For the half marathon, 10K to half marathon, faster half marathon and beginner marathon programs you can choose **3 runs a week** or **4 runs a week** before you start. The four-run version adds a short easy run, so the long run is a smaller share of your week.

The faster 5K, faster 10K, faster half marathon and advanced marathon plans also use **strides** (six quick 20 second efforts at the end of an easy run), **tempo runs** (a steady, comfortably hard stretch of 15 to 35 minutes), **hill repeats** (hard 45 to 75 second efforts uphill with an easy walk or jog back down) and, in the advanced marathon, **marathon-pace blocks** of 40 to 50 minutes inside the long run in the later weeks.

Each workout is a timed plan (a warm-up, the run, a cool-down) that follows the same steps, cues and laps as an interval plan. Runs in the longer programs are timed by minutes, not distance, and the easy runs are meant to be at a pace you could chat at. **Change program** (on the Training programs screen) switches to another one and starts it at week 1.

**How the plans work.** The Training programs screen has a **How the plans work** card that explains this in the app. In short:

- **Each workout** is a warm-up walk (a gentle jog before speed sessions), the run and walk steps in order, then a cool-down walk. Weeks are not tied to the calendar: if you miss a run, the same workout stays due.
- **How hard to run:** go by effort, not pace. Run slowly enough to talk in short sentences. Beginner runs should feel easy to moderate (about 4 to 5 out of 10), easy runs stay conversational, tempo runs feel comfortably hard (6 to 7), and the fast pieces in speed sessions feel hard but controlled (7 to 8) with a relaxed jog between them.
- **How fast to walk:** briskly but comfortably, about 5 to 6 km/h (3 to 3.5 mph), roughly 10 to 12 minutes per kilometer or 16 to 19 minutes per mile. Keep moving rather than stopping: the walks are for getting your breath back, and you should be able to talk normally by the end of each one. Warm-up and cool-down walks can be a little easier.
- **Listening to your body:** aches that settle after a day are normal, sharp or lasting pain is not. If a week was too hard, repeat it or ask Sparky to ease the next workouts, and leave a rest day between runs while you are starting out.

With a program on, **Start today's workout** on the Training programs screen opens Record Activity with the workout already selected (week 1, run 1 first), (the Diary card's **Start** does the same). If you open Record Activity any other way, nothing is chosen for you: you get a plain recording, and the "Today's program workout" card is there with **Do this workout** if you want it (and **Manage** to get back to the program). The Diary also shows today's workout in a card like a scheduled workout plan, with a **Start** button, until you have done one today. Record it like any run: you are told when to run and when to walk. Switch the program off whenever you like on the Training programs screen: the Record screen goes back to a plain recording (you can still pick any interval plan), the Diary card stops, and your place is kept for when you switch it back on.

A workout is ticked off when you get through to its last step and save the activity. If you stop early, the same workout comes up again next time. **Choose a different workout** opens the whole program, week by week, with finished runs ticked: use it to start further in if you already run, to repeat a week, or to go back. **Skip** moves past a workout you cannot do, and **Start over** goes back to week 1. When you finish week 9 the card says so and offers to start again.

On the program card you choose when the workouts show up in your Diary. **Days in your Diary** are the weekdays you plan to run. The workouts are laid out in order on those days, one a day, starting today, so the Diary shows "Scheduled Today" on a run day and "Scheduled" with the workout on the days still to come. With no days picked the Diary shows the next workout every day as "Up next", so you can run whenever you like. **First workout** sets the first day it shows: it starts today unless you pick a date on the calendar. Tapping **Start program** asks the same thing, **Start today** or **Pick a date**, so you can set it up before your first run.  A run you miss is not skipped: the same workout stays due, and the dates after it move along. Everything is saved with your program on the SparkyFitness server, like a workout plan's schedule, so it follows you between devices.

**Schedule and goal date.** Under the program card a **Schedule** list shows the date of each remaining workout, the day you finish, and, if you set a **Goal date** (for example a race day), whether the program fits before it. If it does not, add a run day or move the date. Nothing is scheduled after the goal date. The Diary card stops when you switch the program off or finish it.

**Runs logged some other way.** If you logged a run today that was not recorded as the program workout (from your watch, an import or typed in), the Diary card offers **Count it**, which counts that run as today's workout. It is only a suggestion based on the activity's name and length, and nothing is counted until you tap it.

**Seeing it later.** A run or walk that counted as a program workout says so when you open it from the Diary: a card under the date reads **Part of your training program** with the program and workout, such as "Beginner 5K · Week 3, run 2".

Your place in the program is saved to your SparkyFitness server (only you can see it), so it follows you between devices.

**Coming back after a break.** If it has been two weeks since your last program workout, the Diary card offers to ease the running in your next two workouts by 15%; after four weeks, the next three by 25%. Tap **Ease back in** to apply it (it follows the same limits as above) or **Not now** to leave the plan as it is. It is only offered once per break, and not for walking programs.

**When your training jumps.** The Training Load card on Exercise Statistics compares your last 7 days of workouts (cardio and strength, weighted by heart rate) with your average week over the last four. If the last week is far above your usual, the Diary card offers to ease the running in your next two workouts by 15%. It is not offered again for three days after the plan changes, and a return-from-break offer comes first when both apply. A shorter version of the same card can sit on the Dashboard (Settings → Dashboard → Training Load); it appears once you have logged a workout and opens the full card when tapped.

**Ask Sparky to adjust it.** The AI assistant can see your program and your recent runs. Ask "How am I doing on my 5K program?" or tell it things like "my knee hurt this week" or "that last run was too hard", and it can suggest a change: repeat a week, move you to a different workout, or ease the running time in your next workouts by up to 30% (or lengthen it by at most 10% at a time). However many times it adjusts, running time in a workout never ends up more than 30% below or 10% above the original plan. It can also change your schedule: "run Monday, Wednesday and Saturday", "start the program next Monday" or "my race is on December 6". It only changes workouts you have not done yet, always asks you to confirm first, and keeps a short log of what it changed. For two weeks after a change, the program card on the Training programs screen says what changed and when.

This is a common beginner structure, not medical advice: if you are unsure about starting to run, check with your doctor first.

---

## Recording with the screen locked

- **iOS:** recording keeps running in the background and the status bar shows the blue location indicator. Only "while using the app" location access is needed.
- **Android:** recording runs as a foreground service with a notification while it's active. Only location access while using the app is needed, not "all the time".

Some Android phone makers stop background apps aggressively. If a recording has gaps, set SparkyFitness to **Unrestricted** in the phone's battery settings. [dontkillmyapp.com](https://dontkillmyapp.com) has steps for specific brands.

---

## With an Apple Watch

If you have a paired Apple Watch with the SparkyFitness app, it follows a recording the phone makes:

- The watch opens on a recording page showing the clock, distance and pace, with your current heart rate beside the status.
- Pause, resume and finish work from your wrist. Finishing stops the recording and the page tells you to save it on your iPhone.
- A **Lap** button (flag) marks a lap while the recording is running, and the page shows how many you have marked. A lap is marked at the moment you press it, even if the phone is out of range and only hears about it later.
- The watch measures your heart rate during the activity. It shows live on the watch and on the phone's recording screen (the phone shows it while the watch is in range). After you save, the average, maximum and time in each heart-rate zone appear on the activity.

Nothing is written to Apple Health from the watch until you decide. Saving the activity on your iPhone adds the workout to Apple Health; discarding it doesn't.

The phone still records the route with its own GPS, so keep it with you. Heart rate is attached after the activity is saved. If the watch was out of range for part of it, the readings it held are sent when it reconnects, and the activity can be saved before that. Readings that arrive after saving are not added.

The watch's own GPS is not used, and the activity is saved to Apple Health once, from the watch, without being imported back into SparkyFitness a second time.

---

## Recording a walk or run on the watch alone

On the watch's **Workout** page, above your saved workouts, tap **Cardio** and choose **Run** or **Walk** under **Outdoor** or **Indoor**. The watch then records on its own, with no phone needed:

- The page shows the clock, distance, pace and heart rate, with pause, resume and finish.
- **Outdoors** the watch uses its own GPS for the distance and records the route. The first time, it asks for location access ("while using the app" is enough). If you say no, you still get the workout, just without a route.
- **Indoors** there is no GPS, so the distance is the watch's own estimate from its motion sensors. It gets better the more you use the watch outdoors, since Apple calibrates it from outdoor workouts.
- **Auto-pause:** when you stop, the watch pauses itself ("Auto-paused", with a tap on the wrist) and resumes when you move again. Outdoors it uses GPS speed with the same thresholds as the phone. Indoors it counts your steps: no new steps for about 8 seconds (10 walking) pauses, and about five steps resume. A pause you make yourself is never undone automatically. Pausing is not backdated, so the first few seconds of standing still count. Indoor auto-pause asks for Motion & Fitness access the first time; without it, use the pause button.
- **If the watch app closes mid-run:** open it again and the run carries on where it was. If watchOS had already ended the workout, the run is still sent to your iPhone as far as it got (provided it was at least a minute long with some distance), so the effort isn't lost. After a restart the route in Apple Health begins at that point; the activity in SparkyFitness keeps the whole route.
- Finishing saves the workout (and route) to Apple Health and sends the run to your iPhone, which logs it in your diary as a normal SparkyFitness activity with distance, heart rate, calories and the route. If the phone is out of range or offline, the run waits and is logged when they meet again.

The watch can only run one workout at a time. The page tells you if your iPhone is recording an activity or a strength workout is running, and it won't start in that case.

A watch-only recording buzzes at every completed kilometre or mile, and speaks it ("Kilometer 3. 5 minutes 24 seconds.") when Voice cues is on in the Record screen; the sound comes from the watch speaker or paired headphones. The flag button marks a lap (a second press within 3 seconds is ignored); when you save, an outdoor run is cut at your laps instead of at each kilometre or mile. Indoor runs have no route, so the watch uses the distance it estimated at each flag press: the saved activity gets those laps with their distance and heart rate (a lap's time includes any pause inside it). The Voice cues setting is sent to the watch as soon as you change it. **On your phone:** when the run reaches the phone and is saved to your diary, a message says so with its distance and time; tap it for the same summary screen a phone recording gets (route, splits or laps, heart rate, and your program progress for a plan workout). It appears whenever the phone app is open at that moment, which may be later than the run if the phone was away.

**Follow a plan:** the Cardio list on the watch has a **Follow a plan** section: today's training-program workout (when a program is on) and the built-in interval plans, with the step names in your phone's language. Pick one, then Outdoor or Indoor. The watch shows the step, the time left (or, on a distance repeat, the metres left) and what is next, taps your wrist when a step changes, says it when Voice cues is on, and marks a lap at each step so the saved run is cut into the steps. Pauses never eat into a step. A program workout is ticked off once the run is saved and it reached the plan's last step. The plans come from the phone's last update, so open the app once after changing your program.

---

## Pace zones

Exercise Statistics > Cardio shows five training paces above your session list, easy to hard: **Easy**, **Steady** (about marathon pace), **Threshold**, **Interval** and **Repetition**, in your distance unit.

They are built around your threshold pace, the pace you could hold for about an hour. The best outdoor run of 3 to 25 km in the past 90 days sets it (the effort is carried to an hour with Riegel's formula, so a faster 5K gives faster zones). With no run in that range, the zones are estimated from the average of your recent runs and the card says they are less precise. Treadmill and other runs without a GPS track are not used. They are estimates, not a lab test, and they refresh as you run.

## How the numbers are worked out

- Fixes with a poor accuracy radius, impossible jumps and standing-still jitter are filtered out.
- Elevation gain and loss are measured on smoothed altitude, and only count once a climb or descent passes a small threshold, so a flat route doesn't gain metres from GPS noise.
- Splits are cut at exact kilometre or mile marks, and a short final stretch is kept as a partial split.

---

## Maps on Android

The route map uses Apple Maps on iOS. On Android it uses Google Maps when the build was made with a Google Maps API key; without one, Android shows the route as a plain line instead. See [Environment Variables](/install/environment-variables) for `GOOGLE_MAPS_ANDROID_API_KEY`.

## VO2 max trend

If your Apple Watch or Health Connect source records **VO2 max**, turn on VO2 max sync and a **VO2 max** graph joins the Dashboard's Health Trends (7, 30 or 90 days, one reading per day). Garmin and other providers that store VO2 max with your daily metrics show up too. It is a good way to see whether your training is working. The graph only appears once a reading has synced; hide it or move it in Dashboard Settings → Health Trends.

---

## Not included yet

- Live Activity and lock-screen stats.
- Tracking with the watch's own GPS, on Apple Watch or Wear OS, so the phone can stay behind.
- Wear OS controls and heart rate.

After a program workout is saved, the summary asks how hard it was, from 1 (very easy) to 10 (all out), and keeps your answer with the program. A rating of 8 or more offers to repeat the workout, and 3 or less offers to skip the next one. Two hard or two easy workouts in a row get a note, and Sparky can see your recent ratings when you ask how your program is going. Nothing in the program changes unless you tap the button or agree to something Sparky suggests.

## Personal records

**Library → Personal records** lists your best efforts at 1 km, 1 mile, 5 km, 10 km, 15 km, the half marathon and the marathon, grouped by sport (running, walking, cycling and so on). Records come from your recorded and imported cardio activities, are only compared within one sport, and are the same ones the web Reports page shows.

When a run you just saved set one or more of them, the summary screen shows a **New personal record** card with the distance and time, and a link to the full list. A run recorded on the watch shows it too.

## Correcting a treadmill distance

A run recorded on the watch indoors has no route, so its distance is the watch's estimate from your arm and step motion, which can be off. On the summary screen (tap the "Run from your watch saved" message) a **Treadmill distance** card lets you enter what the machine showed. The distance, pace and lap distances update, and heart rate and calories are kept. Runs with a GPS route get their distance from the route and cannot be changed this way.

## Following a watch run on the phone

While you record a walk or run on the watch alone, the phone shows a bar above the tab bar (like a strength workout) with the clock, distance and pace. Tap it for a full view with heart rate, calories, laps and, if you follow a plan, the current step and what is next. It is a view only: pause and finish on the watch. It appears while the watch and phone are in range, goes away if the watch has been out of range for about 20 seconds, and the finished run is added to your diary as before.
