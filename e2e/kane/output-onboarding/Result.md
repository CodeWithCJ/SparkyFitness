---
test: ../onboarding_test.md
status: passed
started: 2026-10-14T13:51:12.656Z
duration_s: 245
session_id: 642dd1bc-8419-4b52-b9b1-525a18e69087
---

# Sign up and complete onboarding — Result

## Create an account ✓ passed (5.87s)
md5: 5f2f978cfefb624d30e42ee9b0670ba9
Open http://localhost:3004/login and switch to the "Sign Up" tab.
Enter "Alex Runner" as the full name, "alex.runner@example.com" as the email and "RunnerPass123!" as the password, then click the "Sign Up" button.
If an announcement dialog appears, close it with its "Got it, don't show again" button.
Verify the onboarding question "What is your sex?" is shown.

## Answer the profile questions ✓ passed (64.7s)
md5: 1192cbb8168c73cb5a460b7614ecaed9
Choose "Male", then choose "Lose weight" as the primary goal.
Wait for the question "What is your current weight?" to appear, enter 90 as the weight in kg and click "Continue".
Wait for the question "What is your height?" to appear, enter 180 as the height in cm and click "Continue".
Verify the question "When were you born?" is shown.

## Enter the date of birth ✓ passed (61s)
md5: 38306a4c8acc0a8b2c0b09a52e46f586
Open the date picker and pick 15 January 1990 as the date of birth.
Press Escape to close the date picker, then click "Continue".

## Finish the remaining questions ✓ passed (75.1s)
md5: af72a8faf65d41bf51d4c62d49f42457
Answer each remaining onboarding question in turn: choose the first body fat option, enter 80 kg as the target weight if asked, choose "3 meals per day", choose "Moderate (3-5 days/week)" as the activity level, choose not to add burned calories, and click "Continue" on the food sources step.
Verify the personalized plan screen is shown with a daily calorie target.

## Start the plan ✓ passed (33.7s)
md5: 45a3f5ff80f35e567f42ecbcb61de28d
Click the "Start 6-Month Cascading Plan" button.
Verify the onboarding wizard closes and the main dashboard is shown.
