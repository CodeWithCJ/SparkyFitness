# Check-In

The Check-In page in SparkyFitness allows you to quickly log your daily progress, including meals, exercises, and other key metrics. The page is split into six tabs.

## Measurements tab

Log your weight, height, steps, body metrics, and any custom categories you've created. See [Measurements](/features/measurements) for more information.

## Fasting & Mood tab

The top of this tab has two cards side by side:

**Fasting card**: shows your current fast or eating window. You can:

- Start a fast from the card (choose a preset or custom hours)
- Watch the live timer count down (or up during your eating window)
- Edit or delete any fast from the **Recent Fasts** list below

Fasting behavior (the calorie threshold, pre-goal warning, and alerts) is configured under **Settings → Nutrition & Diet → Intermittent Fasting**. Your fasting history and stats live in [Reports](/features/reports).

**Mood card**: answer "How are you feeling today?":

- Set your **Overall mood** with the slider (or tap the emoji face under it): 15 built-in moods from *Sad* to *Excited*
- Tick any number of mood **tags** that also apply (for example: *sensitive*, *tired*, *anxious*)
- Manage which moods show up, and add your own custom moods, from the **Manage** button
- Add free-text **notes**
- Press **Save Mood**

Your mood over time is available through [Reports](/features/reports).

### Several check-ins a day

On the web Check-In page, open the **Fasting & Mood** tab. The left card is the composer, titled **New check-in** (or **Edit check-in** while you change one). It has a Time field, the mood picker, Energy, Focus, tags and a Journal. The Time field starts at the current time when you are on today, and stays on it until you set it yourself; on any other day it starts at 12:00. Every field is optional, but saving a check-in requires at least one content field: mood, energy, focus, tags, or a note (setting the time alone does not allow saving).

The right side lists the day's check-ins in time order, with the day's average mood, energy and focus above the list. Each check-in has an edit button and a delete button, and deleting asks you to confirm. A check-in without a mood is listed without a face and is left out of the average mood. The fasting card sits under the list.

Moods imported from Garmin or a file are not listed here and can't be edited. In Reports, the mood chart shows one value per day: the average of the moods you logged that day, or the Garmin or imported mood when you logged none. Its tooltip shows how many check-ins the day has.

The mobile app lists every check-in too. On the Dashboard, the mood card shows one mood per day and opens a day view with the day's check-ins in time order and the day's averages. Tap a check-in to edit it, swipe it to delete it, or choose **Add check-in** for a new one. The composer has the same optional fields as the web, and the mood can be left unset by tapping the selected face. The mood report and chart show one value per day. If your server is older and only keeps one mood per day, the app keeps the single-entry screen. If the app can't reach your server to check which kind it is, the mood screens show **Retry** instead of a form.

## Mindfulness tab

A small daily space for breathing and meditation:

- **Today's stats**: mindful minutes and the number of sessions recorded so far today
- **Paced Breathing**: a breathwork guide with three patterns:
  - **Box Breathing** (4-4-4-4) for focus and stress relief
  - **4-7-8 Relaxation** for deep calm and sleep prep
  - **Coherent Resonance** for HRV maximization

  Press **Begin Breathing**, follow the Inhale / Hold / Exhale / Rest prompts, and the session is logged when you press **Complete**.
- **Meditation Timer**: run an open or timed session with **Start Timer**, **Pause**, and **Save & Finish**
- **Today's Sessions**: log a session manually (type: *Meditation* or *Breathwork*, minutes and seconds), or edit and delete past sessions

## Sleep tab

Log your sleep for the selected day:

- A day can have multiple **sleep sessions** (for example, a main sleep plus a nap)
- Enter **Bedtime** and **Wake Time** for each session, then press **Save Sleep**

Sleep duration and quality feed the sleep section of [Reports](/features/reports), and your target bedtime (set under [Preferences](/features/settings/preferences)) is used for caffeine sleep-impact estimates on the Diary.

## Photos tab

Upload **progress photos** to track your progress over time:

- Three slots per day: **Front**, **Back**, and **Side**
- Tap a slot to upload, or **Replace** / delete an existing photo
- Days with photos are marked in the calendar on the Check-In page and the date navigator

## Symptoms tab

A quick way to log symptoms and episodes from your daily check-in. For templates, severity scales, location maps, triggers, and clinician-ready exports, see [Symptom & Episode Tracking](/features/symptom-tracking).

## Guided check-in (mobile app)

In the mobile app, **Daily Check-In** in the **+** menu walks you through your daily check-in for the day the Diary is on, one screen after another:

1. **Mood**: how you are feeling, with the same fields as the mood screen.
2. **Measurements**: your weight and body measurements.
3. **Progress photos**: front, back and side.

Each screen shows **Step N of 3**. **Save & continue** saves the step and opens the next one; on the measurements step it moves on without saving when you changed nothing. **Skip** moves on without saving, asking first if you changed something, and is how you leave the mood step without logging a mood. **Back**, on the measurements and photos steps, opens the step before with what you saved there, so you can change it; going back to the mood step edits the mood you logged rather than adding another. On the photos step, **Finish** closes the check-in, and so do the close button, your phone's Back button (Android) and swiping the screen down (iPhone), since photos are saved as you add them; the **Back** in the step bar only returns to the measurements step. Anything you saved stays saved, even if you close the check-in part-way. If you close it, or the phone closes the app, before the photos step is done, tapping **Daily Check-In** again for the same day asks whether to **Continue** where you stopped or **Start over** with a new check-in.

The check-in keeps to logging the day, so the photos step leaves out **Compare**, **Time-lapse** and the **Log weight** shortcuts (weight has its own step). Open Progress Photos from the Add menu for those.

Like any other item in the **+** menu, you can move or hide **Daily Check-In** in **Settings → Quick Actions**.
