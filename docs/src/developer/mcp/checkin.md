---
title: Health Check-in Management Tool
description: Tool for logging and tracking various health metrics including biometrics, mood, sleep, and fasting.
---

# Health Check-in Management Tool (`sparky_manage_checkin`)

The `sparky_manage_checkin` tool is a primary interface for logging and tracking various health metrics. It allows users and AI agents to record biometrics (weight, steps, measurements), custom health metrics, mood, sleep, and fasting windows.

**Tool Name:** `sparky_manage_checkin`

**Description:** Primary tool for health tracking. Use this to log your WEIGHT, daily step count, height, body measurements (waist, neck, hips), mood, sleep duration/quality, and fasting windows. Supports providing health details across multiple turns.

## Actions

The `sparky_manage_checkin` tool supports the following actions:

### `log_biometrics`
- **Description:** Logs or updates various biometric measurements for a given date.
- **Parameters:**
    - `entry_date` (string, YYYY-MM-DD): The date of the record.
    - `weight` (number, optional): Weight value.
    - `weight_unit` (enum: "kg", "lbs", "lb", "g", optional): Unit for weight (defaults to kg).
    - `steps` (number, optional): Daily step count.
    - `height` (number, optional): Height value.
    - `height_unit` (enum: "cm", "in", "inch", "ft", optional): Unit for height.
    - `neck` (number, optional): Neck measurement.
    - `waist` (number, optional): Waist measurement.
    - `hips` (number, optional): Hips measurement.
    - `measurements_unit` (enum: "cm", "in", "inch", optional): Unit for body measurements.
    - `body_fat` (number, optional): Body fat percentage.

### `log_custom_metric`
- **Description:** Logs a value for a user-defined custom health category.
- **Parameters:**
    - `category_name` (string): Name of the custom category (e.g., "Blood Pressure").
    - `value` (string or number): The value to record.
    - `unit` (string, optional): Unit for the recorded value.
    - `notes` (string, optional): Optional notes for the entry.
    - `entry_date` (string, YYYY-MM-DD): The date of the record.

### `list_categories`
- **Description:** Lists all user-defined custom health categories.
- **Parameters:** None.

### `create_category`
- **Description:** Creates a new custom health category for logging.
- **Parameters:**
    - `category_name` (string): Name of the custom category.
    - `unit` (string, optional): Unit for the new category.

### `log_mood`
- **Description:** Logs a new mood check-in. Every call adds a check-in, so a day can hold several. Every parameter is optional, but at least one of mood, energy, focus, notes or tags is required. The check-in is timestamped with the current time, or with local noon when `entry_date` is another day.
- **Parameters:**
    - `mood_value` (integer 1-10, optional): Mood score. There is no default; omit it for a check-in with no mood.
    - `energy_value` (integer 1-5, optional): Energy rating (1 = drained, 5 = energized).
    - `focus_value` (integer 1-5, optional): Focus rating (1 = scattered, 5 = locked in).
    - `notes` (string, optional): Optional notes about the mood.
    - `mood_tags` (string[], optional): Mood tags or emotions, for example `["anxious", "tired"]`.
    - `entry_date` (string, YYYY-MM-DD, optional): The date of the record. Defaults to today.

### `log_fasting`
- **Description:** Logs a fasting window.
- **Parameters:**
    - `start_time` (string, ISO 8601): Start timestamp of the fasting window.
    - `end_time` (string, ISO 8601, optional): End timestamp of the fasting window.
    - `fasting_status` (enum: "ACTIVE", "COMPLETED", "CANCELLED", optional): Current status of the fast.
    - `fasting_type` (string, optional): Type of fasting (e.g., "Intermittent").

### `log_sleep`
- **Description:** Logs sleep details for a given date.
- **Parameters:**
    - `entry_date` (string, YYYY-MM-DD): The date of the sleep entry.
    - `duration_seconds` (number, optional): Total sleep duration in seconds.
    - `sleep_score` (number, optional): Sleep quality score (0-100).
    - `bedtime` (string, ISO 8601, optional): Bedtime timestamp.
    - `wake_time` (string, ISO 8601, optional): Wake up timestamp.
    - `source` (string, optional): Source of data (e.g., "manual", "Garmin", "Fitbit").

### `list_checkin_diary`
- **Description:** Retrieves all logged health check-in entries (biometrics, mood, sleep, custom metrics) for a specific date. Every mood check-in of the day is listed in time order, each as `- HH:MM <score>/10<ratings><tags> — notes` in the user's timezone (the score is omitted for a check-in with no mood). A device-derived mood (Garmin or import) is shown only when no manual check-in that day has a mood. Sleep bed and wake times are shown as `YYYY-MM-DD HH:MM` in the zone the night was recorded in (else the user's timezone; a recording zone that differs from the user's is named on the line), and fasting start and end times in the user's timezone. Custom metrics that hold a raw data series, such as Garmin's "Raw Stress Data", are listed as `(raw data series, not shown)`.
- **Parameters:**
    - `entry_date` (string, YYYY-MM-DD, optional): The date to retrieve the diary for. Defaults to today.

### `get_custom_metrics_history`
- **Description:** Lists custom metric values by day, newest day first, one `- <name>: <value> <unit>` line per value under a `## YYYY-MM-DD` heading. Long decimals are rounded to two places and raw data series are left out, so a week of device metrics fits in one result; when the result is still too long, the oldest days are dropped.
- **Parameters:**
    - `start_date` (string, YYYY-MM-DD, optional): Start of the range.
    - `end_date` (string, YYYY-MM-DD, optional): End of the range.
    - `category_name` (string, optional): Only this metric, matched on its stored name first, then its display name (case-insensitive). When several metrics share that display name, the reply lists their stored names instead.
