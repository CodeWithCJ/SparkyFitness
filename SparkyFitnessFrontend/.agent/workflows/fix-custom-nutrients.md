---
description: Fix custom nutrient display in Food Database and Meal Management.
---

1.  **Foods.tsx**: Update nutrient value extraction.
    - Find the `visibleNutrients.map` loop.
    - Update the `value` assignment to check `food.default_variant?.custom_nutrients?.[nutrient]` if the nutrient is not found on the variant directly.
    - Example: `const value = (food.default_variant?.[nutrient as keyof FoodVariant] as number) || (food.default_variant?.custom_nutrients?.[nutrient] as number) || 0;`

2.  **MealManagement.tsx**: Synchronize display logic.
    - Inject `usePreferences`.
    - Replicate `getEnergyUnitString` logic.
    - Replicate `quickInfoPreferences` / `visibleNutrients` logic.
    - Update `MealManagement` component to use `visibleNutrients` for the loop.
    - Refactor the aggregation logic to:
      - Initialize `aggregatedValues` object.
      - Iterate through `meal.foods`.
      - For each food, iterate through `visibleNutrients`.
      - Add up values, checking both standard fields and `custom_nutrients`.
      - Apply `convertEnergy` for calories if needed.
    - Update the JSX to map over `visibleNutrients` and display the aggregated values.
    - Ensure the grid layout uses the responsive `minmax` style from `Foods.tsx`.

3.  **Verify**: Check both pages for correct values and layout.
