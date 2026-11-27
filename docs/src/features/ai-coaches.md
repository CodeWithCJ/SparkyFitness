# AI Coaches

AI Coaches look at the data you already log (food, training, sleep, weight, habits) at times you choose, and leave a short message in Sparky chat **only when something is worth saying**. They are off until you turn them on, and they never change anything without your tap.

They work on the website and in the mobile app.

## Turn them on

1. Go to **Settings → Features** and switch on **Coaches**, in the app you want them in. The website and the mobile app each have their own switch.
2. Open **Settings → Wellness → Coaches** (website) or **Settings → Coaches** (app). Fill in **About me**, pick your check-in times and switch on the coaches you want.

Coaches belong to the account owner. Someone acting for you through Family & Friends access does not see them, and they never run for anyone but you.

## About me

One profile shared by every coach and by normal Sparky chat (while Coaches are on): your diet, foods to avoid, foods you like, preferred tone, and notes. Your allergies come from **Settings → Nutrition & Diet → Allergen preferences**. You can edit or clear all of it any time. Coaches treat it as information about you, never as instructions.

## Check-ins and limits

- Coaches look at your data at your **check-in times**, in your own time zone. The default is 08:00, 13:00 and 19:00; you can use one to four times, on the quarter hour.
- You choose **at most 1 to 5 messages a day** (default 3). The same message is never sent twice in a day, and problems come before wins when the limit is tight.
- A check-in that is more than an hour old when the server gets to it is skipped, so a late message never surprises you.
- **Pause coaches** until a date (sick, travelling, injured) and they stay quiet; they also tell Sparky you are away.

### Check in now

You don't have to wait for the next check-in time. In **Settings → Wellness → Coaches** (website) or **Settings → Coaches** (app), the **Check in now** section shows when the last check-in ran and has a **Check in now** button. It runs one check-in right away for the coaches you switched on, and tells you how many messages it sent, or why none: coaches are paused, none is switched on, today's limit is reached, or nothing matched your data today. It follows the same rules and daily limit as a scheduled check-in. The messages are in the coach's thread in the chat.

## The coaches

| Coach | Looks at | Example |
|---|---|---|
| **Recovery** | Training and food together | Protein is at 61% of your goal after yesterday's strength workout. |
| **Consistency** | Logging gaps and streaks | It's been 3 days since you logged. Logging your next meal gets you back on track. |
| **Nutrition** | Today's protein, fibre, calories and water against your goals | Fibre is at 40% of your goal. |
| **Sleep & recovery** | Last night's sleep against your usual and your recent training | You slept much less than usual and your training load is high. |
| **Daily outlook** | Sleep and training load, first thing in the morning | Take it easy today: short sleep and a heavy week. |
| **Weekly review** | The week's weight trend and how closely you followed your target | A new calorie target to apply, if your trend says so. |
| **Training** | Your lifts and your workout plan | Two lifts have stopped progressing; plan changes you can apply. |
| **Habits** | One habit you pick | A gentle evening "did you do it?", and your streaks. |

Open a coach's **When it speaks up** section to switch single rules off or change their numbers. **Would it speak right now?** checks today's data against the rules. It uses no AI and sends nothing. The weekly review and the training coach run on the weekday you choose.

### Your own coaches

On the website you can **create your own coach**: a name, how it should talk to you, what data it may look at, and when it speaks up. That is either **rules** you build from a list of numbers (protein as a share of your goal, hours since a workout, sleep against your usual, and so on), which use no AI until a rule matches, or **let the AI decide**, where you describe in your own words what to watch for and the AI judges at each check-in whether to speak (about one AI call per check-in). You can have up to ten. In the app they appear in the list and can be switched on or off.

## Messages

A coach's messages arrive in Sparky chat, in a thread of their own. On the website the chat button shows a red dot with the number of unread messages; in the app the Ask Sparky card does. Opening it takes you to the newest one. Use the picker at the top of the chat to switch between Sparky and your coaches. Each message shows the coach's name and a small **Because** line with the numbers behind it. Reply in a coach's thread and you talk to Sparky with that coach's focus and data access.

On every message you can say **This helped** or **This did not help**. Three "did not help" on the same topic within 30 days and the coach stops bringing it up, and tells you so; **What my coaches know** (website) lists those topics so you can turn them back on.

### Suggestions

Some messages offer a change, which only happens when you tap **Apply**:

- a higher protein goal for today (tomorrow goes back to your usual),
- a new calorie target from today (the weekly review, from your adaptive estimate; never below the safe minimum),
- weight changes to your workout plan (the training coach).

### Quick questions and wins

A coach can ask a quick question instead of giving advice: "How is your energy today?" (1 to 5, saved as a mood check-in) or "Did you do your habit today?" (saved to your habit log). It can also celebrate: a personal record, a logging streak, a protein streak. At most one win a day.

### After a workout

A coach can send one short message soon after a new workout is logged or synced. Old workouts arriving from a sync stay quiet.

### Cycle tracking

If you use cycle tracking, coaches take your phase into account in how they word things. They never diagnose.

## On your phone

When a coach writes, the app shows a **notification**; tapping it opens that coach's thread. The app checks for new messages in its background sync, so on iPhone, where the system decides when background tasks run, a message can arrive a little after the check-in time. Opening the app always shows it. Turn notifications off, or per coach, in **Settings → Coaches**. Messages never pass through any outside push service.

## AI provider

Coaches use **your own AI provider** (your key, or your local model) to word a message, and only when a rule matches, so a quiet day costs nothing. Without a provider, or if it fails, you get a short fixed message instead. You can still read it, but you need a provider to reply.

## Privacy

Everything stays on your server. Only the wording of a message is sent to the AI provider you already use for Sparky, with the numbers behind it, your About me and your allergies.

## Why didn't my coach speak?

- No rule matched at that check-in, or the daily limit was already reached.
- It already said that today.
- Coaches are paused, or the Coaches feature is off in that app.
- The check-in time passed while the server was down (more than an hour ago).
