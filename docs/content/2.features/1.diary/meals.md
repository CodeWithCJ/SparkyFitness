# Meals & Meal Categories

This section provides an overview of meal-related features in SparkyFitness.

---

## Suggested Meal Category Times

SparkyFitness dynamically suggests the appropriate meal category (e.g., Breakfast, Lunch, Dinner, Snacks, or custom categories) when you log food based on your current time of day.

### How Suggested Times Work
Each meal category can have a **Default Time** assigned to it:
- When you log food, the app finds the meal category whose `default_time` is the **latest time that is less than or equal to your current time** ($\le \text{now}$).
- Each meal category's default time defines the start of its window until the next scheduled meal.
- For example, if **Snacks** is set to `5:00 PM` (`17:00`) and **Dinner** is set to `7:00 PM` (`19:00`):
  - Logging food between `5:00 PM` and `6:59 PM` will automatically suggest **Snacks**.
  - Logging food at or after `7:00 PM` will automatically suggest **Dinner**.

### Customizing Default Times
You can customize the target start time for any meal category on both Web and Mobile:
- **Web**: Go to **Settings → Meal Categories** and edit the **Default Time** (`HH:MM`) for any category.
- **Mobile**: Go to **Settings → Food Settings → Suggested Meal Times** and adjust the target times (`HH:MM`).

---

## Custom Meals

Custom meals can be created and consist of previously added foods. That way, you can group foods together and don't have to add them one by one. An example of how this might look like is provided below:

Meal Management:
![image](https://github.com/user-attachments/assets/4d7cb5e2-d188-4915-b8d5-0f17bf1dad88)

Adding a meal:
![image](https://github.com/user-attachments/assets/827cc881-5472-461f-94e4-3f86023b58c1)
