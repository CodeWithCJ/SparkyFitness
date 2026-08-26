---
title: Coaching and Trends Tool
description: Provides health summaries and analyzes long-term trends for coaching insights.
---

# Coaching and Trends Tools

The coaching tools are designed to provide high-level insights into a user's health status and long-term trends. It aggregates data from various sources (food, exercise, check-ins) to offer summaries and identify patterns relevant for health coaching.

**Tool Names:** `sparky_get_health_summary`, `sparky_analyze_trends`, `sparky_get_30_day_trends`, `sparky_detect_patterns`, `sparky_generate_coaching_plan` (a group of separate tools, not a single one)

## Tools within Coach

### `sparky_get_health_summary`
- **Description:** Get a summary of the user's health status (Nutrition, Fitness, Vitals) for a specific date range.
- **Parameters:**
    - `start_date` (string, YYYY-MM-DD): Start date for the summary.
    - `end_date` (string, YYYY-MM-DD, optional): End date for the summary. Defaults to `start_date` if not provided.

### `sparky_analyze_trends`
- **Description:** Analyze weight trends vs. calorie intake to identify plateaus or progress. (Feature coming in full Phase 3 implementation!)
- **Parameters:**
    - `days` (number, optional): Number of days to analyze. Defaults to 7.

### `sparky_get_30_day_trends`
- **Description:** Get comprehensive trends for the last 30 days including food, exercise, mood, sleep, and biometrics. This tool gathers aggregated data across these domains to provide a holistic view of the user's progress and patterns.
- **Parameters:**
    - `end_date` (string, YYYY-MM-DD, optional): End date for the 30-day period. Defaults to today.
