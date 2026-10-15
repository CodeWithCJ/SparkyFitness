---
mode: testing
url: http://localhost:3004/
max_steps: 40
---

# Log a custom food to the diary

## Create an account and skip onboarding
Open http://localhost:3004/login and switch to the "Sign Up" tab.
Enter "Jamie Cook" as the full name, "jamie.cook@example.com" as the email and "CookPass123!" as the password, then click the "Sign Up" button.
If an announcement dialog appears, close it with its "Got it, don't show again" button.
Click "Skip" on the onboarding screen.
Verify the diary is shown with an empty "Breakfast" section.

## Create a custom food from the Breakfast section
Click the add button in the "Breakfast" section, then choose "Custom Food".
Enter "Greek Yogurt Bowl" as the food name, 100 as the serving size in g, 150 as the calories and 10 as the protein, then click "Add Food".
In the "Add Greek Yogurt Bowl to Meal" dialog, keep the quantity at 100 g and click "Add to Meal" once.
The food is now logged. Close the "Add New Food" and "Add Food to Breakfast" dialogs that stay open with their "Close" buttons, without adding anything else.

## Check the diary totals
Wait until the add food dialog has closed and the "Breakfast" section lists "Greek Yogurt Bowl".
Verify the "Breakfast" section shows 150 kcal for "Greek Yogurt Bowl".
Wait 3 seconds for the daily energy summary to refresh, then verify it shows 150 kcal eaten.
