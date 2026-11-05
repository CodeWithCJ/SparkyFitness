# Progression & Per-Set Ramp

Workout presets have two separate ways to move the weight for you. They sit side by side in the preset editor but answer different questions:

| | Progression | Add per set (ramp) |
| :--- | :--- | :--- |
| **When it changes the weight** | Next workout | Next set, in the same workout |
| **Condition** | Only after you hit your rep goal | Always |
| **Example** | 3 × 5 at 60 kg, all reps hit → next week starts at 62.5 kg | Today: 60 → 62.5 → 65 kg |
| **Editor field** | Progression mode, rep goal, increment | **Add per set (this workout)** |

You can use both. Progression sets the weight your first working set starts at, and the ramp steps up (or down) from there.

All weight increments are stored in kilograms and shown in the weight unit you picked in Settings, so a preset edited on the web and used on the phone behaves the same way.

---

## Per-set ramp

The ramp pre-fills each working set a little heavier than the one before, within a single workout. It saves typing a new weight for every set when you work up in steps.

### Setting it up

| Where | How |
| :--- | :--- |
| **Web** | Exercises → Workout Presets → edit a preset → expand an exercise → **Add per set (this workout)**. Enter a negative number to ramp down. |
| **Mobile app** | Workout Presets → edit a preset → tap **Progression** on an exercise → **Add per set (this workout)**. Choose **Up** or **Down** and enter the amount. |

Leave the field empty (or 0) to turn the ramp off.

The editor keeps the weights you typed for each set. The ramp is applied when you **start** the workout.

### What you'll see

With the first working set at 185 lb and **+10 lb** per set:

| Set | Pre-filled |
| :--- | :--- |
| 1 | 185 |
| 2 | 195 |
| 3 | 205 |

With **−10 lb** (back-off sets): 185 → 175 → 165.

- **Warm-up and drop sets are skipped.** They are neither ramped nor used as the starting point. Failure sets ramp like working sets.
- **Loadable weights.** Values are rounded to 0.25 kg or 2.5 lb, and a downward ramp stops at that smallest step instead of reaching zero.
- **Today's lift doesn't move it.** If you lift 225 on set 1 instead of 185, sets 2 and 3 still show 195 and 205. The ramp follows the preset, not what you just lifted.
- **Added sets continue the ramp.** Adding a set mid-workout pre-fills the next step (215 in the example).
- **Standard workouts only.** Interval, Tabata, EMOM, AMRAP and For Time formats are clock-driven and ignore the ramp.
- **On mobile** the ramped values are the grey placeholders; completing a set without typing logs what the row shows. **On the web** they are filled into the weight fields when the workout opens, and reopening a saved workout keeps whatever you've typed since.
- **With history.** On mobile, set 1 still starts from last session's set 1 (the PREVIOUS column is unchanged); the later sets ramp from it rather than showing their own history.

---

## Progression

Progression moves the weight (or the reps) **between workouts**, once you've earned it.

| Mode | Goal | What goes up |
| :--- | :--- | :--- |
| **Total Rep Goal** | A total number of reps across your working sets | Weight, or reps |
| **Fixed Target** | A number of reps on every working set | Weight, or reps per set |
| **Step-Load** | A total number of reps | Reps, at the same load |
| **Double Progression** | Every working set at the top of a rep range (for example 8 to 12) | Weight, then reps start again at the bottom of the range |
| **Triple Progression** | Same as Double | A set first (up to 2 more than planned), then weight |
| **Manual** | — | Nothing (off) |

When last session met the goal, the next workout is pre-filled with the increase:

- **Weight increase**: each working set starts from its own previous weight plus the increment, so pyramid sets keep their shape.
- **Rep increase**: Fixed Target raises the target on every working set (8 → 9 reps). Total Rep Goal and Step-Load split the new total across the working sets, with earlier sets taking any remainder (26 reps over 3 sets → 9 / 9 / 8).

- **Double and Triple Progression**: while any set is short of the top of the range, the weight holds and the aim is the top. Once every set gets there, the weight goes up by your increment and every working set drops to the bottom of the range. Triple adds a set first; once it is two sets over the plan and every set is at the top, the weight goes up and you go back to the planned sets. On the web the extra set is added for you; on mobile the hint tells you to add it.

Warm-up sets are never counted or changed.

### Stalls and deloads

In every mode that adds weight, three sessions in a row that miss the goal at the same weight trigger a deload: the next workout starts about 10% lighter, rounded down to whole increments so the plates still work (100 kg with a 2.5 kg increment → 90 kg; 62.5 kg → 55 kg). The hint says why. Then you build back up from there. Rep-only modes (Step-Load, or a reps increment) never deload.

### Updating the preset after a workout (mobile)

When you finish a workout on mobile, the app offers to update the preset if what you did differs from it. Values that progression or the ramp filled in, logged as shown, don't count as a difference, so they neither trigger the prompt nor overwrite the weights stored in the preset. Only values you changed yourself do.

---

## AI assistant & MCP

The AI assistant can create and edit presets with these settings. `ramp_increment` and a weight `increment_value` are in kilograms; for example "+10 lb per set" is `ramp_increment: 4.54`. When the assistant updates a preset's exercise list, any setting it leaves out keeps its current value. See the [exercise tool reference](/developer/mcp/exercise).
