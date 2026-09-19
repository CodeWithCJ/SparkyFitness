---
title: Engagement and Nudge Tool
description: Tools for proactive user engagement, streak tracking, and contextual nudges.
---

# Engagement and Nudge Tools

The engagement tools are designed to enhance user engagement through automated triggers, streak tracking, and context-aware nudges. These tools help to motivate users and provide timely, relevant feedback.

**Tool Names:** `sparky_check_engagement`, `sparky_get_logging_streak`, `sparky_get_contextual_nudge` (a group of separate tools, not a single one)

## Tools within Engagement

### `sparky_check_engagement`
- **Description:** Scans the user's data for moments that require a proactive nudge (e.g., missed workout, plateau, achievement).
- **Parameters:**
    - `user_id` (string): The ID of the user to check. Defaults to `MOCK_USER_ID`.

### `sparky_get_logging_streak`
- **Description:** Retrieves the user's current consecutive logging streak for any health or fitness data.
- **Parameters:** None. (Note: Logic for streak calculation is a feature coming soon!)

### `sparky_get_contextual_nudge`
- **Description:** Generates a context-aware nudge based on recent user activity or inactivity.
- **Parameters:** None. (Note: Logic for contextual nudge generation is a feature coming soon!)
