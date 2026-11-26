# Guided Workouts

Guided mode talks you through a workout so you don't have to watch the screen. It announces each exercise and its target, counts you in, runs timed sets on their own, reads the exercise instructions, and moves on to the next set when you're done. It works in the live workout player on the web and in the mobile app.

Guided mode is **off by default**. With it off, workouts look and sound exactly as before.

---

## Turning it on

| Where | How |
| :--- | :--- |
| **Mobile app** | Settings → Workout Settings → **Guided workouts** → Guided mode |
| **Web** | Settings → Wellness → **Guided workouts** → Guided mode |

Once guided mode is on, you can also choose:

- **Voice**: any voice installed on the device or browser. The list shows voices for your app language first. *Device default* / *Browser default* follows your app language.
- **Speech rate**: 0.5× to 2.0×, in steps of 0.25.
- **Get-ready countdown**: 3 to 15 seconds (default 5).
- **Test voice**: plays a sample with your current choices.

These settings are stored on each device and browser separately, because the installed voices differ from one device to another. Turn guided mode on everywhere you want to use it.

---

## What happens during a workout

A **guided card** sits at the top of the live workout, above the normal set list. The list stays fully editable, so you can still change weights, reps, and rest times.

1. **Get ready.** At the start of the workout you hear *"Get ready. Starting Push-up."* while a countdown runs, with beeps at 3-2-1.
2. **Each set is announced**, for example *"Push-up. 12 reps."* or *"Plank. 45 seconds."*. On the first set of each exercise, every instruction line from the exercise library is read while you work.
3. **Rep-based sets** show a large **DONE — NEXT** button. Tap it when you're done: the set is logged, the rest timer starts, and you hear *"Rest. 90 seconds. Next: Squat."*
4. **Timed sets** (holds, planks, cardio blocks) get their own get-ready countdown. Then the timer starts by itself, you hear *"Halfway"* on sets of 10 seconds or longer, the 3-2-1 beeps play, and the set logs itself when time is up. The target duration is what gets recorded.
5. **When the rest ends**, the next set is announced and the cycle repeats.
6. **At the end** you hear *"Workout complete."*

The card shows the exercise image, current set details, target information, and on-screen captions. Exercises with several library images (usually a start and an end position) flip between them every second as a movement demo; animated GIFs play as they are.

### Captions, pause and mute

- **Captions:** a band across the bottom of the exercise image shows what is being said, line by line, including each instruction as it is read.
- **Replay** (↻ in the card) reads the current set's announcement and all of its instructions again, even on later sets where they are normally skipped. During a rest it previews the next exercise. Timers keep running while it reads.
- **Pause** (⏸ in the card) freezes everything: the get-ready countdown, a running timed set and the rest timer. Speech stops. **Resume** carries on from the same second, and paused time is never added to a timed set.
- **Mute** (speaker icon) silences the voice for the current workout. Beeps still play and the captions keep going, so you can follow along silently. Leaving the workout turns the voice back on.

### Interval formats

For **Tabata, EMOM, AMRAP, For Time and custom interval** workouts, the interval clock and its chimes stay exactly as they are (see [Interval & WOD Workouts](./interval-wod-workouts.md)). Guided mode adds:

- the exercise name spoken at the start of each work interval, with its target
- *"Rest"* followed by the next exercise when it changes
- the current or upcoming exercise's name and image in the interval HUD
- *"Workout complete"* when the clock runs out

On mobile, the existing 5-second interval lead-in also announces the first exercise.

---

## Workout summary

When you finish a workout on the web, a summary shows how long it took, the calories burned (in your energy unit), the sets completed, and the volume. Close it to return to the diary. The mobile app already shows the same information on its workout-complete screen.

---

## Sound, silent mode and the screen

- **Mobile, silent switch:** with guided mode on, cues play even when the phone is on silent, the same as the interval formats. Music keeps playing under the voice.
- **Mobile, screen:** the screen stays on during a guided workout. The app can't speak with the screen locked, so it keeps the screen on to keep the cues going.
- **Leaving the app or tab:** narration stops while the app is in the background or the browser tab is hidden. When you come back, the timers have kept running and guided mode picks up at the right set, without reading out the cues it missed.
- **Mute:** turn guided mode off in settings at any time. The workout carries on and the normal beeps and rest chime are unchanged.

---

## Languages

Everything guided mode says (apart from the exercise instructions, which are read as written in your exercise library) goes through the app's translations and follows your app language. Choose a voice that matches that language for the best pronunciation.

## Follow along with a video

In the workout preset editor, add one YouTube link or a direct link to a video file, such as a self-hosted MP4. For each exercise you want to sync, enter the start and end positions in seconds from the beginning of the video. Leave space between exercises for breaks or instructions. The video position replaces the preset’s interval or rest clock while following a video. The video link and timings follow the sharing settings of the preset.

Start the preset and select **Load video**. The current exercise, remaining time, next exercise, and workout progress follow the video position. Pausing freezes the countdown. Seeking moves the display to the new position. An exercise is marked complete once its full segment has played, including if you go back and play a section you skipped.

When the video ends, the workout saves the completed exercises. You can also finish early to save your progress or log sets manually. YouTube videos must allow embedding, and direct links must be playable by the device. Use HTTPS for self-hosted videos if you use the mobile app or access your SparkyFitness site over HTTPS. Video playback requires access to the video host.
