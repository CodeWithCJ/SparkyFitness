---
mode: testing
url: http://localhost:3004/
max_steps: 40
---

# Sign up and complete onboarding

## Create an account
Open http://localhost:3004/login and switch to the "Sign Up" tab.
Enter "Alex Runner" as the full name, "alex.runner@example.com" as the email and "RunnerPass123!" as the password, then click the "Sign Up" button.
If an announcement dialog appears, close it with its "Got it, don't show again" button.
Verify the onboarding question "What is your sex?" is shown.

## Answer the profile questions
Choose "Male", then choose "Lose weight" as the primary goal.
Wait for the question "What is your current weight?" to appear, enter 90 as the weight in kg and click "Continue".
Wait for the question "What is your height?" to appear, enter 180 as the height in cm and click "Continue".
Verify the question "When were you born?" is shown.

## Enter the date of birth
Open the date picker and pick 15 January 1990 as the date of birth.
Press Escape to close the date picker, then click "Continue".

## Finish the remaining questions
Answer each remaining onboarding question in turn: choose the first body fat option, enter 80 kg as the target weight if asked, choose "3 meals per day", choose "Moderate (3-5 days/week)" as the activity level, choose not to add burned calories, and click "Continue" on the food sources step.
Verify the personalized plan screen is shown with a daily calorie target.

## Start the plan
Click the "Start 6-Month Cascading Plan" button.
Verify the onboarding wizard closes and the main dashboard is shown.
