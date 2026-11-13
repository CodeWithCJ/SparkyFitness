# Following a Route on Apple Watch

An Apple Watch can follow one of your [saved routes](/features/exercises/route-generation) during an outdoor walk or run. It shows the line, the next turn and the distance left, buzzes before each turn and warns you when you have left the route. This needs an iPhone with a paired Apple Watch; there is no Android or Wear OS version.

---

## Start a route from your phone

1. Open **Library → Routes** and tap a route.
2. Tap **Start on watch**, then choose **Run** or **Walk**.
3. The watch opens and starts an outdoor workout that follows the route. The phone shows the live view of the run.

You can also pick a route when you start a watch run from the Record screen: choose **Watch GPS**, an outdoor walk or run, then a route under **Route**. Indoor runs and rides don't offer routes, because there is no GPS to follow a line with.

The route travels with the start request, so nothing has to be set up beforehand.

---

## Keep routes on the watch and run without your phone

On a route's screen, **Send to watch** puts a copy in the watch's own library. Then, with the phone left behind, open **Cardio** on the watch, pick the route under **Routes**, and choose Run or Walk.

- The watch holds up to **10 routes**. A full watch turns a new route away and the route screen says so; remove one with **Remove from watch** and send the new one again.
- The route screen shows **Sent. Waiting for your watch to confirm.**, **On your watch**, or **Out of date, send again**. After you edit a route the watch keeps the old copy until you send it again.
- Deleting a route on the phone removes it from the watch. If you are running that route at the time, it is removed when the run ends.
- Routes are sent as a queued transfer, so they reach the watch when it is next in range.

A route is sent with at most 2,000 points (a longer one is thinned, keeping its shape and turns); that is about 20 KB.

---

## During the run

- **Main page:** a strip under the clock shows the next turn and the distance to it. It turns red with a warning when you are off the route.
- **Route page** (swipe up or turn the Digital Crown): Apple Maps close around you, turned so the way ahead points up and following you as you move. The route ahead is bold cyan, the part you have covered is grey, the next turn is a marker with its arrow, and the distance left and next instruction sit underneath. The map stays pulled back far enough to keep the next turn on screen.
- **Overview page** (one more swipe up): the whole route on one map, north up, with your dot on it.
- **Maps and your privacy:** the maps are Apple Maps. The watch asks Apple for map tiles for the area on screen, as the Maps app does, and for nothing else; SparkyFitness has no map server of its own and sends no route or position anywhere to draw them. Without a signal the map is blank but the route and your dot still draw. The map only runs while its page is showing and is switched off when the screen dims, so it does not add GPS use.
- **Turns:** the watch buzzes about 50 m before a turn and, with voice cues on, says "In 50 m, turn left". A route without turn instructions (a GPX track) gets them worked out from its shape.
- **Off route:** farther than 40 m from the line for more than 6 seconds buzzes and says so; getting back on the line buzzes again. A bad GPS fix (accuracy worse than 50 m) is ignored.
- **Finish:** within 25 m of the end the watch says you have reached it.
- Buzzes and spoken lines pause while the run is paused. Following a route uses the run's own GPS, so it does not add battery drain of its own.

If the watch app closes mid-run and you open it again, the run carries on with the same route.
