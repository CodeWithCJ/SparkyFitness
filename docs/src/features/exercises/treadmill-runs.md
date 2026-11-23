# Treadmill Runs

A treadmill has no GPS route, so the distance of an indoor walk or run comes from somewhere else: your phone's step count, your watch, or the figure on the machine's display. This page covers how each is handled and how to make them agree with the machine. It applies to the mobile app and the Apple Watch.

---

## Where the distance comes from

| How you recorded it | The distance is | Corrected for the treadmill? |
| --- | --- | --- |
| Indoor on the phone, left as filled in | Steps counted by the phone times your stride | No. It is the phone's own measurement. |
| Indoor on the phone, typed from the display | What you typed | Yes, if the correction is on |
| Indoor on the watch, Keep watch distance | The watch's motion estimate | No |
| Indoor on the watch, typed on the wrist | What you typed | Yes, if the correction is on |
| Summary screen, **Treadmill distance** card | What you typed | Yes, if the correction is on |

A correction is applied once, when a figure is read from the display. It is never applied on top of a distance that already came from steps or from the watch.

## Treadmill & Stride settings

Open **Settings > Workout > Treadmill & stride**. The screen has three short lists: **Your stride**, **Is your treadmill accurate?** and **Watch's own estimate**. Each row shows where things stand in one line; tap a stride or the treadmill row to change it. Everything here is kept on your phone only (see [Why it stays on the device](#why-it-stays-on-the-device)).

### Your stride

Indoors there is no GPS, so the app turns your steps into distance with your stride. Walking and running each have their own, in metres or feet to match your distance unit, with where it came from:

- **typical**: a typical adult's stride, until the app learns yours.
- **learned from N distances**: each distance you corrected, or each saved outdoor walk or run, taught it. Newer distances move it gradually, so one odd treadmill does not undo a good stride. A watch run teaches it too, from the steps Apple Health holds over the run, whether you typed the distance on the watch or on the run summary. A run counts once: a figure you enter again for the same run replaces the first instead of adding to it.
- **set by you**: you typed it or measured it. It counts for a few learned distances, so the next real distance nudges it instead of replacing it.

Tap a stride to change it. Type a new one and tap **Save** (a step shorter than 0.3 m or longer than 2.5 m is refused), or tap **Measure it on a track**: walk or run a distance you know is real, such as laps of a track, then enter the **Steps taken** (from Health, Google Fit or your watch) and the **Real distance**, and tap **Set my stride** (at least 150 steps and 100 m). **Reset** forgets that stride and goes back to the typical one.

### Is your treadmill accurate?

This is for a treadmill whose own screen is off, for example a belt that shows 5.2 mi when you covered 5.0. It fixes every distance you type in from that screen, on the phone or on the watch. You set it; it never learns by itself. Distances worked out from your steps are never changed. If you have never noticed your treadmill being off, leave it on **About right**.

Tap **Treadmill display** and pick what your treadmill shows compared with what you really ran: **About right** (the default; nothing is changed), **More** or **Less**. For More or Less, enter by how much, up to 25 percent. The screen shows an example: when it shows 5.00 km, 4.81 km is saved.

Not sure by how much? Tap **Not sure? Work it out from your steps**. Walk or run on the treadmill, then pick **Walk** or **Run** and enter the **Steps taken** and what the **Treadmill showed**. Your steps times your stride give the real distance, so measure your stride first. **Check my treadmill** says how far off the display is and offers **Use this correction**. Nothing changes until you tap it, and your stride is not changed.

The correction divides the display figure by one plus the percent, so a display that reads 4 percent long and shows 5.20 km is saved as 5.00 km. The stored distance, and the pace worked out from it, are the corrected ones. Where it matters the screens show both: "Treadmill showed 5.20 km. Saved as 5.00 km with your +4% treadmill correction." Choose **About right** to save figures exactly as typed.

### Watch's own estimate

When you finish a watch treadmill run and keep the watch's distance instead of typing the treadmill's, the watch's own estimate is used. It guesses from your arm swing, and the guess can be off by a steady amount. Each time you do enter what the treadmill showed after a watch run, the app works out how far off the watch was (against the corrected distance, if your treadmill is set as off), and the watch applies that to its next treadmill run. This is automatic, and walks and runs are learned separately.

**Watch's own estimate** shows how much the watch's distance is raised or lowered (for example "Raised by 9.6%") and how many runs it was learned from. **Reset** forgets it, and the watch goes back to its own estimate. Runs already saved are not changed.

## Cadence and stride on a watch run

A watch run is saved as soon as it reaches the phone, which can be before the watch's steps have reached Apple Health. When that happens the run is saved without cadence and stride, and the app measures it again every 15 minutes while it is open, for up to three days, until the steps are there. It then adds them to the run you already have, and teaches your stride if you entered the treadmill's distance. The app also looks back over the last three days for runs and walks that were saved without a cadence and measures those too.

## While you record

On the Record screen, the distance field at Finish is filled in from your steps. If you leave it, it is saved as is and teaches nothing. If you change it, you are reading the treadmill: with the correction on, the corrected figure is saved and your stride learns from that true distance, not from the display.

On the summary screen, the **Treadmill distance** card works the same way. When a correction applies, the card shows what the machine showed next to what was saved. A distance typed on the watch is corrected when the phone files the run, once, and the summary shows both figures.

## Why it stays on the device

The stride is learned from this phone's step counter, so it is only right for this phone. The correction describes one machine, and you may use a different treadmill at home and at the gym, or change phones. Neither needs a server setting, the saved distance is already the corrected one, and nothing on the server has to know how it was worked out. The cost is that a new phone starts from the default stride and no correction.

## See also

- [GPS Activity Recording](/features/exercises/gps-activity-recording)
- [Shoe Inventory](/features/exercises/shoe-inventory)
