# Zone 2 Running: Research Notes

Developer note behind the [Zone 2 base program](/features/exercises/zone-2-program). It records how other apps and coaches define and coach Zone 2 and base building, what we could and could not verify, and how that shaped our own design. Nothing here is copied from another app: the program, wording and numbers are ours.

::: warning How this was checked
Researched on **19 October 2026** with web searches. The search results were summaries of each page, and most pages were not opened in full. Anything marked **(unverified)** came from a secondary source, a forum post, a fragment of a page, or could not be found. Apps change their zones and plans often, so recheck before relying on a number.
:::

## How Zone 2 is defined

| Source | Definition | Notes |
| --- | --- | --- |
| **Garmin** | Zones default to a share of maximum heart rate, with Zone 2 at 60 to 70 percent. The "Based on" setting switches to bpm or percent of heart rate reserve, and each sport profile has its own zones. | [Garmin zone manual](https://www8.garmin.com/manuals-apac/webhelp/instinctesports/EN-SG/GUID-CB4B90EE-F287-48C1-8C0A-657FA98694C4-1721.html), [Setting your heart rate zones](https://www8.garmin.com/manuals/webhelp/edge1030/EN-US/GUID-94A5A126-6BB2-47F6-8040-EAD29EC66C2B.html) |
| **Polar** | Five zones as percentages of maximum heart rate. Zone 2 at 60 to 70 percent appeared in a press article that did not credit it to Polar, so the exact Polar band is **(unverified)**. | [Polar Running Program](https://support.polar.com/en/support/polar_running_program), [TechRadar](https://www.techradar.com/health-fitness/how-to-use-heart-rate-zones-on-your-smartwatch-to-smash-your-fitness-goals-according-to-research) |
| **Whoop** | Its own pages disagree: 60 to 70 percent of a "realized" maximum heart rate in one, 60 to 70 percent of heart rate reserve in another. One version says zones follow maximum and resting heart rate over the last 14 recoveries. | [Whoop: Zone 2 training](https://www.whoop.com/us/en/thelocker/why-zone-2-training-is-the-secret-to-unlocking-peak-performance/), [Whoop: max heart rate zones](https://www.whoop.com/thelocker/max-heart-rate-training-zones) |
| **Apple Fitness / Watch** | Secondary sources say heart rate reserve (resting plus a share of maximum minus resting) with zones refreshed monthly. Apple's own method is not published, so this is **(unverified)**. | [Training Today](https://trainingtodayapp.substack.com/p/how-accurate-are-apple-watch-heart), [Barbell Medicine forum](https://forum.barbellmedicine.com/t/apple-heart-rate-zone-calculation-automatic-fitness-correction/14390) |
| **Strava** | Default zones come from an age-based maximum heart rate (220 minus age); an athlete can override the maximum or set custom edges. The Zone 2 percentages are not stated in what we found **(unverified)**. | [Strava support](https://support.strava.com/en-us/articles/15401923-how-do-i-customize-my-heart-rate-zones-on-strava) |
| **Runna** | Treats pace, perceived effort and heart rate zones as three lenses that do not always agree, with effort the most reliable on a given day. Only a fragment of the help article was visible, and its heart rate numbers could not be retrieved **(unverified)**. | [Runna: make the most of your easy runs](https://support.runna.com/en/articles/15820108-how-to-make-the-most-of-your-easy-runs) |
| **Nike Run Club** | Nothing found on heart rate or Zone 2. Its guided "Easy Run" and coaching start every run easy. **(unverified)** | [Nike: Find your fast](https://www.nike.com/running/find-your-fast-running-guide) |
| **TrainingPeaks (Friel)** | Percent of lactate threshold heart rate: Zone 2 is 85 to 89 percent for running (81 to 89 for cycling). Threshold comes from a 30 minute solo test, and Friel warns against 220 minus age. | [Friel's quick guide to setting zones](https://www.trainingpeaks.com/learn/articles/joe-friel-s-quick-guide-to-setting-zones/) |
| **Intervals.icu** | Zone models are configurable. Friel as the default and Coggan as the alternative came from forum posts **(unverified)**. It charts decoupling (cardiac drift) and has a Seiler-style variant. | [Intervals.icu decoupling](https://www.intervals.icu/features/seiler-decoupling/), [forum](https://forum.intervals.icu/t/heart-rate-zones-range-settings-in-i-icu-was-different-from-strava-now-not-matching-power-zones/1094) |
| **Maffetone** | 180 minus age, then adjusted by training history, injury and illness (the adjustments differ between sources). Uphill Athlete calls it a conservative estimate of the aerobic threshold and suggests it as the top of Zone 2 for people new to aerobic training. | [Maffetone: 180 formula](https://philmaffetone.com/180-formula/), [Uphill Athlete](https://uphillathlete.com/aerobic-training/maf-method-for-determining-your-aerobic-threshold/) |
| **Seiler** | A three-zone model anchored to two lactate thresholds: Zone 1 is at or below the first, Zone 3 at or above the second. Elite endurance athletes spend roughly 75 to 80 percent of time in Zone 1; estimates differ. Conversational effort is the practical proxy. Note this "Zone 2" is the band *between* thresholds, which is not the same as the five-zone "Zone 2" used by watches. | [Fast Talk: science behind polarized training](https://fasttalklabs.com/articles/the-science-behind-polarized-training) |
| **San Millán** | Zone 2 is the intensity of peak fat oxidation (FATmax), near the first lactate inflection. People define the top of it several ways (VT1, LT1, FATmax, about 75 percent of maximum heart rate, a DFA alpha 1 value of 0.75). Weekly minutes and the lactate value (often quoted as 2 mmol) were **not** confirmed in what we found. | [Uphill Athlete forum](https://uphillathlete.com/?p=59939), [Attia topic guide](https://peterattiamd.com/zone-2/) |

**Takeaway.** There is no single Zone 2. The three common approximations land in different places for the same person:

| Method (example: age 40, maximum 185 bpm, resting 52) | Zone 2 |
| --- | --- |
| 60 to 70 percent of maximum heart rate | about 111 to 129 bpm |
| 60 to 70 percent of heart rate reserve | about 132 to 145 bpm |
| Maffetone 180 minus age | up to 140 bpm (top of the range) |

The reserve method and Maffetone usually give higher numbers than the percent-of-maximum default. A lactate or ventilatory test is the only way to find a person's own boundary; the talk test is the practical stand-in.

## Heart rate or pace

Heart rate (or effort) is the target in every coaching source we found; pace is a poor target for easy running because the same pace costs more on a hot day, a tired week or a hilly route. Examples:

- A Garmin Coach user reported an easy-run pace target that still averaged 152 bpm, which they found harder than easy ([Garmin forum](https://forums.garmin.com/apps-software/mobile-apps-web/f/garmin-connect-web/359738/garmin-coach-easy-running-pace), anecdote). Whether Garmin Coach uses pace or heart rate by default could not be confirmed.
- Runna's help article says Zone 2 can need a slower pace than expected, and that walking now and then to stay in range is normal.
- Easy running is described as conversational and under about 5 out of 10 effort by coaches quoted in [Tom's Guide](https://www.tomsguide.com/features/youre-probably-running-your-easy-miles-too-fast-heres-how-to-pace-yourself).

## Typical plan shapes

From general coaching and plan-generator pages (mixed quality, so use as ranges rather than rules; see [Active](https://www.active.com/running/articles/2-rules-for-building-your-running-base?page=2), [Rundida](https://rundida.com/guide/endurance-building-plan/), [RunBikeCalc](https://runbikecalc.com/blog/base-building-aerobic-development-guide-2026)):

| Question | What the sources say |
| --- | --- |
| Sessions per week | Three to four easy runs, plus rest days. |
| Length | Often 8 to 12 weeks. |
| Progression | Total time in zone up about 10 to 15 percent a week, with a lighter week roughly every fourth week (volume down about 30 to 40 percent). The "10 percent rule" is a load heuristic, not proven: one randomized trial found it did not lower injury rates. |
| Long run | One longer run a week; 90 minutes to 2 hours for people training for a race, shorter for a general base. |
| Quality work | Little or none. Where present, strides, hill sprints or short tempo segments stay at about 5 to 10 percent of volume or less. |
| Retesting | Same course, same heart rate, compare pace every four to six weeks ([Uphill Athlete](https://uphillathlete.com/?p=60930)); about every four weeks in [Runner's Blueprint](https://www.runnersblueprint.com/the-maf-test-your-progress-report-without-the-ego/). The early weeks can ignore pace entirely. |

## Heart rate drift and runners with no strap

- **Drift is normal.** Polar's cardiac drift guide shows a runner whose pace and breathing stayed the same over 90 minutes while heart rate rose from 140 to 154 bpm, and says a rising rate on a long effort is not necessarily a sign of overexertion ([Polar](https://www.polar.com/en/guide/cardiac-drift-effect-on-training)). Runners on the Uphill Athlete forum report roughly 5 to 10 bpm after 2.5 to 3 hours ([forum](https://uphillathlete.com/forums/topic/heart-rate-drift-staying-in-zone-2/)).
- **How much is too much.** A cycling coach says a well-trained rider can hold 90 minutes of Zone 2 with under 5 percent decoupling ([Roadman](https://roadmancycling.com/blog/aerobic-decoupling-cycling-cardiac-drift)). We found no running-specific cutoff for when to slow down, so the practical rule is to slow down when effort feels harder, not just because the number rose, and to check heat, fluids and recent sleep.
- **No strap.** Effort wins when sources disagree: the talk test (full sentences) and a 3 to 4 out of 10 effort. Apps that offer a heart rate target still describe effort as the fallback.

## What we built from it

| Finding | Our design |
| --- | --- |
| Heart rate or effort, not pace | Zone 2 workouts carry a **heart rate range** and a talk test description. They never carry a pace. |
| Definitions differ; no single answer | Use the default every major watch shares: **60 to 70 percent of maximum heart rate**, from an age-based estimate (the same estimate the server uses for time in zone). Say plainly that it is an estimate and that the talk test wins. A measured maximum or custom zones plug into one function when they exist. |
| No strap is common | The range is still shown (read it off any device). The card falls back to the talk test when no live reading is available. |
| Drift and a slow start | While judging a Zone 2 stretch, the lower edge is relaxed for the first three minutes and the upper edge gives up to 5 bpm of drift between 20 and 60 minutes. The shown target stays the plain range. |
| Plan shape | **10 weeks**, **3 or 4 easy runs a week**, time in zone growing, a lighter fourth and eighth week, one long run (up to 70 minutes), and short strides in three weeks only. |
| Retest | A **zone check** in weeks 4, 8 and 10: a normal Zone 2 run on a repeatable route, then compare pace at the same effort. |
| Quality work | None beyond four 20 second strides after the first run in weeks 6, 7 and 9, under 2 percent of the week. Strides carry no heart rate range because heart rate lags a short effort. |

## What it does not do yet

- The maximum heart rate is an estimate from age. Setting a measured maximum, a resting heart rate or another method (reserve, Maffetone, threshold) is not available; see the Zone 2 program page for where that plugs in.
- Live heart rate cues need a paired Apple Watch. The app has no Bluetooth chest strap or phone-strap source today.
- No drift measurement after the run (decoupling) and no lactate or ventilatory threshold input.
