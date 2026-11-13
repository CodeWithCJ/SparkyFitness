# Adaptive Coaching

SparkyFitness can help during and after a workout, not just plan it:

- **Smart alternatives** when you need to swap an exercise (busy machine, missing equipment, an injury).
- **How did it feel?** feedback after a workout: too easy, just right or too hard, plus pain or discomfort.
- **Adaptive suggestions** that use that feedback for the next session, and always say why.
- **Variation hints** when an accessory exercise shows up in almost every workout.
- **Plan weight changes** in the AI assistant: proposed changes to the planned weights of your workout plan, each with its reason, applied only when you agree.
- **Run review** in the AI assistant: a read of your recent running (runs per week, weekly distance, pace against the period before, training load and recovery), explained in plain language.
- **Training review** in the AI assistant: a read of your recent strength work (sessions per week, lifts that have stopped improving, effort and muscle coverage), explained in plain language.
- **Lower music during cues** (mobile app) so beeps and spoken cues are easy to hear over your own music.

Alternatives, feedback and adaptive suggestions work on the web and in the mobile app, and through the [AI assistant and MCP server](/features/mcp-server). Lowering music during cues is a mobile app setting.

---

## Smart alternatives

Replacing an exercise opens a **Suggested** tab with ranked alternatives instead of a blank search.

| Where | How |
| :--- | :--- |
| **Mobile, live workout** | ⋯ on an exercise → **Replace exercise** |
| **Mobile, editing a workout or preset** | ⋯ on an exercise → **Replace exercise** |
| **Web, workout player** | The ⇄ button on an exercise card |
| **Web, preset editor** | **Replace exercise** on an exercise |

Alternatives must train the same primary muscles and be the same kind of exercise (a rowing machine never replaces a lift). They are ranked by:

1. how closely the primary muscles match,
2. the same equipment (in **Similar** mode),
3. the same movement pattern (for example, compound push),
4. how recently you did them, and whether they are already in your library.

Each result shows why it was suggested ("Same muscles", "Done recently", …).

- **Other equipment** shows only exercises that use none of the original's equipment. Use it when a machine is taken, you train at home, or a grip hurts.
- Results marked **New** come from [Free Exercise DB](/features/exercises/exercise-database-manager) and are added to your library when you pick one. They appear only while the Free Exercise DB provider is active in your settings. If the server can't reach it, only your library is shown.
- Exercises already in the workout are left out.
- Free search is always one tap away (**Search all exercises**, or the Search / My Exercises tab).

::: tip No suggestions?
An exercise with no primary muscles recorded can't be ranked. Add its muscles in the exercise library and suggestions appear.
:::

---

## Workout feedback: "How did it feel?"

After finishing a workout you're asked how it felt. Every answer saves as you tap; there's no Save button.

| Question | Answers |
| :--- | :--- |
| How did it feel? | Too easy · Just right · Too hard |
| Any pain or discomfort? | On/off, then optionally **which exercises** and a note |
| Rate each exercise (optional) | Too easy · Just right · Too hard, per exercise |

Where you can give or change it:

| Where | How |
| :--- | :--- |
| **Mobile** | The workout complete screen, and later the workout's detail screen |
| **Web** | The "Workout complete" dialog, and later by expanding the workout in your diary |
| **AI assistant** | "Today's workout felt too hard and my left knee hurt" |

Feedback is shared like the rest of your diary: people with **Manage Diary** can see and record it for you, and people with **View Reports** can see it. See [Family & Friends Sharing](/features/family-friends-sharing).

---

## Adaptive suggestions

When you start a workout, each exercise's suggested weight takes your recent feedback into account. The rules are simple and predictable:

| What happened recently | What changes today | Message you see |
| :--- | :--- | :--- |
| Pain in this exercise last time | 10% lighter, never heavier, and alternatives are offered | "Lighter today: you reported pain here last time." |
| Pain in this exercise two sessions running | 10% lighter; an alternative is recommended | "Lighter today: pain here two sessions running…" |
| Pain last workout, exercise not named | No weight increase | "Holding weight: you reported discomfort…" |
| Too hard last time | No weight increase | "Holding weight: last time felt too hard." |
| Too hard two sessions running | 10% lighter | "Lighter today: too hard two sessions running." |
| No feedback, but your last sets were logged at RPE 9.5+ or 0 RIR | No weight increase | "Holding weight: your last sets were near max effort." |
| No feedback, but your last sets were logged at an average RPE of 7 or lower (or 3+ reps in reserve) | One step heavier (your preset's increment, else 2.5 kg / 5 lb) | "A step heavier: your last sets were logged as easy." |
| Too easy two sessions running | One step heavier (your preset's increment, else 2.5 kg / 5 lb) | "A step heavier: too easy two sessions running." |

- Weights are rounded down to a loadable step (2.5 kg or 5 lb) and always drop at least one step on a lighter day.
- Only feedback from the last **21 days** counts, and interval/WOD workouts are never adjusted.
- **Every change is a suggestion.** Tap **Use my usual** to go back to the normal suggestion for that exercise (and **Use the adjusted suggestion** to switch back again).
- This builds on [Progression](/features/exercises/progression-and-per-set-ramp): feedback can pause or add to it, but never replaces it.

### Turning it off

Adaptive suggestions are **on by default**. Until you give feedback, the only things that can change are holding the weight when your last sets were logged at near-max effort (RPE 9.5+ or 0 RIR), and adding a step when they were logged as easy (RPE 7 or lower, or 3+ reps in reserve). Warm-ups are not counted, and an answer to the difficulty question always wins over logged effort. To turn them off:

| Where | How |
| :--- | :--- |
| **Web** | Settings → Guided workouts → **Adaptive workout suggestions** |
| **Mobile** | Settings → Workout Settings → **Adaptive suggestions** |

It's one account setting, so turning it off on one device turns it off everywhere. With it off, suggestions behave exactly as they did before feedback existed.

---

## Variation hints

If an accessory exercise (anything that isn't a compound lift) appears in **6 or more** workouts within **28 days**, you'll see "You've done this in most recent workouts. Try a variation?" with a shortcut to its alternatives. Compound lifts such as squats and bench press are left alone on purpose: they are what progression is built around.

---

## Lower music during cues (mobile)

SparkyFitness never stops your music. Workout beeps and guided-workout voice always play over Spotify, Apple Music, YouTube Music and so on.

Turn on **Settings → Workout Settings → Lower music during cues** and your music is briefly turned down while a beep or spoken cue plays, then comes back up. It's off by default. There's nothing to set up on the web; browsers already mix sounds.

---

## Ask the assistant

| You say | What happens |
| :--- | :--- |
| "What can I do instead of barbell bench press? I only have dumbbells." | Ranked alternatives using only dumbbells |
| "My shoulder hurts. Chest exercises that don't use shoulders?" | Alternatives that avoid shoulder muscles |
| "Yesterday's workout felt too easy." | Saves the feedback on that workout |
| "Will my Push Day change next time?" | Explains each exercise's adjustment and why |
| "Should I add weight to my plan?" | Proposes planned-weight changes with reasons, and applies the ones you agree to |
| "How is my running going?" | Reads your last 4 weeks of runs and your training load, and explains what it finds |
| "How is my training going?" | Reads your last 4 weeks (ask for 7–90 days) and explains what it finds |

---

## Training review

The assistant can review your recent strength training. SparkyFitness works out the numbers and the assistant explains them:

- **Sessions** in the window and how many a week that is. With fewer than three sessions there is no trend, and the assistant says so rather than recommending changes.
- **Stalled lifts**: lifts whose last two or more sessions did not beat your best estimated one-rep max by at least 1%. A lift needs three sessions before it can count as stalled. A planned deload looks like a stall, so the assistant is told to check before blaming the program.
- **Effort**: your average RPE and RIR, and any lift you regularly take to or near failure. This is blank unless you log RPE or RIR.
- **Muscle coverage**: working sets per muscle in the window, and muscles you trained earlier but not in this window.

Bodyweight exercises and cardio are not part of stall detection, and sets above 12 reps are not used to estimate strength. The review only reads your data; it never changes your plan.

---

## Run review

The assistant can also review your recent running. SparkyFitness works out the numbers and the assistant explains them:

- **Runs** in the window and how many a week. With fewer than three runs there is no trend, and the assistant says so.
- **Weekly distance**, and any week that rose more than 10% on the one before, the usual limit for adding distance.
- **Pace** over the window against the same length of time before it. Runs under 1 km are left out.
- **Training load**: this week's workouts (all of them, not only runs) against your four-week average, with a recovery hint. This needs about three weeks of history.

Distances and paces use your distance unit. The review only reads your data; if you follow a run program, the assistant asks before changing it.

---

## Plan weight changes

Ask the assistant whether your plan needs changing and it reviews the planned weights of your active (or a named) workout plan against what you actually lifted. SparkyFitness works out the proposals and the assistant explains them:

- **Add a step** (2.5 kg or 5 lb) to a lift when you met the planned weight and reps in each of your last two sessions without logging a near-failure effort, or when you rated it too easy twice in a row.
- **Lighten** a lift after pain in that exercise or two sessions rated too hard. After repeated pain the assistant also offers alternatives.
- **Hold** a lift that you rated too hard last time, whose logged effort was at or near failure, or whose estimated one-rep max has stopped improving. A hold changes nothing; the assistant asks before suggesting a deload or a swap.

Warm-up sets, bodyweight exercises and preset-based sessions are never changed. Nothing is written until you agree: the assistant names each exercise and the new weight, and only then applies it. The weights come from the rules, never from the assistant. Plans that pre-fill your diary are not edited this way, because their diary entries are built from the weights; the assistant describes the change and updates the plan instead.

## Effort on an exercise

Each exercise's **History** tab starts with an **Effort** card once you have logged an RPE for it. It shows the average RPE of your last session and, as bars, of up to your last ten sessions, coloured from easy to max. For a plain weight and reps exercise it also shows an **estimated 1RM with effort**: the best set's Epley estimate counting the reps you had left, so 100 kg for 5 reps at RPE 8 counts as 7 reps. Next to it is the estimate from reps alone. Only sets with an RPE between 6 and 10 are adjusted, and warm-ups are ignored. Personal records and best sets are unchanged and still use reps alone.
