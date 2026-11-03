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

Open **Settings > Workout > Treadmill & stride**. Everything here is kept on your phone only (see [Why it stays on the device](#why-it-stays-on-the-device)).

### Your strides

Walking and running each show the stride the app uses to turn steps into distance, in metres or feet to match your distance unit, and where it came from:

- **Default stride. Not learned yet.** A typical adult's stride is used.
- **Learned from N real distances.** Each distance you corrected, or each saved outdoor walk or run, taught it. Newer distances move it gradually, so one odd treadmill does not undo a good stride. A watch run teaches it too, from the steps Apple Health holds over the run, whether you typed the distance on the watch or on the run summary. A run counts once: a figure you enter again for the same run replaces the first instead of adding to it.
- **Set by you.** You typed it or calibrated it. It counts for a few learned distances, so the next real distance nudges it instead of replacing it.

## Cadence and stride on a watch run

A watch run is saved as soon as it reaches the phone, which can be before the watch's steps have reached Apple Health. When that happens the run is saved without cadence and stride, and the app measures it again every 15 minutes while it is open, for up to three days, until the steps are there. It then adds them to the run you already have, and teaches your stride if you entered the treadmill's distance. The app also looks back over the last three days for runs and walks that were saved without a cadence and measures those too.

## Watch treadmill distance

A watch estimates a treadmill run's distance from your motion, and the estimate can be off by a steady amount. Each time you enter what the treadmill showed after a watch run, the app works out how far off the watch was, and the watch applies that to its next treadmill run. Walks and runs are learned separately.

Under **Watch treadmill distance** you can see the factor the watch is using (for example 1.096, or +9.6%) and how many corrections it comes from. **Reset and learn from scratch** forgets it, and the watch goes back to its own estimate. Runs already saved are not changed.

To set a stride by hand, type it under the stride and tap **Save**. A step shorter than 0.3 m or longer than 2.5 m is refused. **Reset and learn from scratch** forgets one activity's stride and goes back to the default.

### Correct treadmill distance

If your treadmill display reads long or short, turn this on, choose **Long** or **Short**, and enter how far off it is, up to 25 percent. The screen shows an example: a display of 5.00 km saved as 4.81 km.

The correction divides the display figure by one plus the percent, so a display that reads 4 percent long and shows 5.20 km is saved as 5.00 km. The stored distance, and the pace worked out from it, are the corrected ones. Where it matters the screens show both: "Treadmill showed 5.20 km. Saved as 5.00 km with your +4% treadmill correction." Turn the switch off to save figures exactly as typed.

### Calibrate on purpose

Walk or run a distance you know is real, then enter:

- **Steps taken**, from Health, Google Fit or your watch.
- **Real distance**, for example a measured track or a GPS run of the same effort.
- **Treadmill showed**, optional.

**Calibrate** sets your stride for that activity from the steps and the real distance (at least 150 steps and 100 m). If you gave the treadmill figure, it also tells you how far off the display is and offers **Use this correction**. Nothing is switched on until you tap it.

## While you record

On the Record screen, the distance field at Finish is filled in from your steps. If you leave it, it is saved as is and teaches nothing. If you change it, you are reading the treadmill: with the correction on, the corrected figure is saved and your stride learns from that true distance, not from the display.

On the summary screen, the **Treadmill distance** card works the same way. When a correction applies, the card shows what the machine showed next to what was saved. A distance typed on the watch is corrected when the phone files the run, once, and the summary shows both figures.

## Why it stays on the device

The stride is learned from this phone's step counter, so it is only right for this phone. The correction describes one machine, and you may use a different treadmill at home and at the gym, or change phones. Neither needs a server setting, the saved distance is already the corrected one, and nothing on the server has to know how it was worked out. The cost is that a new phone starts from the default stride and no correction.

## See also

- [GPS Activity Recording](/features/exercises/gps-activity-recording)
- [Shoe Inventory](/features/exercises/shoe-inventory)
