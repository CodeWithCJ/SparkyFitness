---
title: Compare Metrics Tool
description: Asks whether two tracked things go together, or whether something changed since a habit started, with the same statistics as the Compare report.
---

# Compare Metrics Tool (`sparky_compare_metrics`)

`sparky_compare_metrics` puts the Compare report's questions to the AI chat and MCP clients: "Does sleep go with my mood?" or "Has my mood changed since I started meditating?". It calls the same service as `GET /api/v2/reports/compare`, so the chat, the app and any MCP client get the same numbers. It only reads data. Read-only API keys can use it, and it always answers about the signed-in person's own data.

The result is short Markdown text. It contains the question, the range, a one-line answer and the numbers behind it. For a link it adds the checks (which comes first, and whether weekends explain it). It closes with a reminder that a link is not proof of cause. Today, and in week mode the current week, is never counted because it isn't over yet.

**Tool Name:** `sparky_compare_metrics` (in the `reports` chat category)

## Actions

### `compare`
- **Description:** Does A go with B? Each day (or week) is measured against the person's own normal: the previous 14 days, or 6 weeks by week. The answer has r, a 95% range and an honest p-value; the p-value uses an effective sample size, because neighbouring days resemble each other. A yes/no metric such as `meditated` compares the averages on yes and no days instead.
- **Parameters:**
    - `a` (metric key): The first thing.
    - `b` (metric key): The second thing.
    - `by` (enum: "day", "week", optional): Pair the two by day (default) or by week.
    - `timing` (enum: "same_day", "a_then_b", "b_then_a", optional): `same_day` (default) pairs A and B on the same day or week. `a_then_b` pairs A with B the next day or week, and `b_then_a` pairs A with B the day before. By week, `b_then_a` is asked as `a_then_b` with the two swapped. Sleep metrics are dated by the day the person woke, so a day's caffeine with that night's sleep is `a_then_b`; the answer words this the way the app does ("that night", "the night before").
    - `start_date` (string, YYYY-MM-DD, optional): First day of the range. Defaults to 90 days before `end_date`, or 26 weeks by week. A range can be at most 180 days by day and 366 by week.
    - `end_date` (string, YYYY-MM-DD, optional): Last day of the range. Defaults to today.

### `since`
- **Description:** Has outcome B changed since habit A started? It compares B's days before the start with its days since, on B's own scale. With no start date it suggests one: the first of 3 weeks in a row with the habit on at least 4 days each. It also reports how many weeks the habit was kept up, and warns when B was already moving that way before the start. Weight trend isn't offered in since questions, because it drifts too slowly to tell a change from its own wandering, and the tool refuses it with a validation error.
- **Parameters:**
    - `a` (metric key): The habit.
    - `b` (metric key): The outcome.
    - `habit_start_date` (string, YYYY-MM-DD, optional): The day the habit started; before today and at most 730 days ago.

### `list_metrics`
- **Description:** Lists the metric keys with their group and unit, and notes the ones read over a rolling 7 days, offered by day only, or not for since questions.

## Metric keys

`mood`, `energy`, `focus`, `timeAsleep`, `sleepScore`, `overnightHrv`, `restingHeartRate`, `bedtime`, `bedtimeConsistency`, `meditationMinutes`, `meditationSessions7d`, `meditated`, `calories`, `protein`, `carbs`, `fat`, `caffeine`, `alcohol`, `workoutMinutes`, `cardioMinutes`, `strengthVolume`, `trainingLoad`, `weightTrend`, `steps`.

The catalog lives in `shared/src/compare/metrics.ts`. The tool shows mood on the 1-10 scale the chat uses elsewhere, and bedtime as a clock time.
