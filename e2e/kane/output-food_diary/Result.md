---
test: ../food_diary_test.md
status: passed
started: 2026-10-14T14:11:02.612Z
duration_s: 187
session_id: ebaf59e8-297a-422c-abdc-411bf71fb020
---

# Log a custom food to the diary — Result

## Create an account and skip onboarding ✓ passed (14.89s)
md5: c1600d778f1061c5a6e24fb3f593fcb8
Open http://localhost:3004/login and switch to the "Sign Up" tab.
Enter "Jamie Cook" as the full name, "jamie.cook@example.com" as the email and "CookPass123!" as the password, then click the "Sign Up" button.
If an announcement dialog appears, close it with its "Got it, don't show again" button.
Click "Skip" on the onboarding screen.
Verify the diary is shown with an empty "Breakfast" section.

## Create a custom food from the Breakfast section ✓ passed (80.4s)
md5: 325b5d3c62fe123fd8c5817234b583f9
Click the add button in the "Breakfast" section, then choose "Custom Food".
Enter "Greek Yogurt Bowl" as the food name, 100 as the serving size in g, 150 as the calories and 10 as the protein, then click "Add Food".
In the "Add Greek Yogurt Bowl to Meal" dialog, keep the quantity at 100 g and click "Add to Meal" once.
The food is now logged. Close the "Add New Food" and "Add Food to Breakfast" dialogs that stay open with their "Close" buttons, without adding anything else.

## Check the diary totals ✓ passed (87.6s)
md5: 3f84518692b8451f412b268beec02807
Wait until the add food dialog has closed and the "Breakfast" section lists "Greek Yogurt Bowl".
Verify the "Breakfast" section shows 150 kcal for "Greek Yogurt Bowl".
Wait 3 seconds for the daily energy summary to refresh, then verify it shows 150 kcal eaten.
