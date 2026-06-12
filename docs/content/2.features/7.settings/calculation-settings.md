# Calculation Settings

This page explains how BMR formulas, body fat algorithms, daily energy adjustments, and calorie deficit targets are calculated in **SparkyFitness**.

---

## 1. Basal Metabolic Rate (BMR) Algorithms

Your Basal Metabolic Rate (BMR) represents the energy your body requires to perform basic life-sustaining functions at rest. SparkyFitness supports multiple clinical formulas to estimate BMR:

| Algorithm | Required Inputs | Best For | Formula |
| :--- | :--- | :--- | :--- |
| **Mifflin-St Jeor** *(Default)* | Age, Gender, Height, Weight | General population | $\text{Male: } 10W + 6.25H - 5A + 5$<br>$\text{Female: } 10W + 6.25H - 5A - 161$ |
| **Revised Harris-Benedict** | Age, Gender, Height, Weight | Historical comparison | $\text{Male: } 13.397W + 4.799H - 5.677A + 88.362$<br>$\text{Female: } 9.247W + 3.098H - 4.33A + 447.593$ |
| **Katch-McArdle** | Weight, Body Fat % | Individuals with tracked body fat | $370 + 21.6 \times \text{LBM}$<br>*(LBM = Lean Body Mass)* |
| **Cunningham** | Weight, Body Fat % | Highly athletic/muscular builds | $500 + 22 \times \text{LBM}$ |
| **Oxford** | Weight, Gender | Varied age groups & demographics | $\text{Male: } 14.2W + 593$<br>$\text{Female: } 10.9W + 677$ |

*Note: Weight ($W$) is in kg, Height ($H$) is in cm, and Age ($A$) is in years.*

---

## 2. Body Fat Algorithms

Body Fat Percentage is used directly in lean-mass BMR formulas (Katch-McArdle/Cunningham). SparkyFitness can estimate body fat percentage from your measurements using two algorithms:

### U.S. Navy Method
Uses circumferences to estimate body fat. Measurements are converted to inches for the standard formula:
*   **Males:** $86.01 \times \log_{10}(\text{waist} - \text{neck}) - 70.041 \times \log_{10}(\text{height}) + 36.76$
*   **Females:** $163.205 \times \log_{10}(\text{waist} + \text{hips} - \text{neck}) - 97.684 \times \log_{10}(\text{height}) - 78.387$

### BMI Method
Uses height, weight, and age to estimate body fat:
*   **Males:** $1.2 \times \text{BMI} + 0.23 \times \text{Age} - 16.2$
*   **Females:** $1.2 \times \text{BMI} + 0.23 \times \text{Age} - 5.4$
*   *(where $\text{BMI} = \text{Weight (kg)} / \text{Height (m)}^2$)*

---

## 3. Daily Calorie Goal Adjustment

This setting determines **how physical activity changes your calorie budget** throughout the day:

*   **Adaptive TDEE:** Dynamically computes your metabolic expenditure by correlating your actual weight changes with your historical calorie intake over the last 35 days. *(Best for high-precision tracking).*
*   **Dynamic Goal:** Increases your budget as you burn active calories or take steps (adds exercise directly back to your budget).
*   **Fixed Goal:** Your calorie target remains completely static, ignoring daily exercise.
*   **Percentage Earn-Back:** Adds back a custom percentage (e.g., $50\%$) of active calories burned to create a buffer against device calorie over-estimations.
*   **Device Projection:** Projects your total full-day burn by extrapolating active steps and device data to midnight (MyFitnessPal style).

---

## 4. Goal Mode & Caloric Deficits

**Goal Mode** applies a body composition percentage-based deficit or maintenance target to your baseline maintenance:

| Goal Mode | Deficit Percentage | Target Purpose |
| :--- | :--- | :--- |
| **Maintain** | $0\%$ | Weight maintenance |
| **Body Recomposition** | $10\%$ | Gain muscle while losing fat simultaneously |
| **Cut** | $15\%$ | Steady fat loss |
| **High Cut** | $20\%$ | Aggressive fat loss |
| **Manual** | Custom ($0\% - 40\%$) | Personalized deficit rate |

### Calculation Methods
*   **Adaptive Method:** Applies the deficit to your Calculated Adaptive TDEE (falling back to BMR × activity multiplier if history is insufficient). 
*   **Manual Method:** Applies the deficit to your manually entered calorie target.

---

## 5. Metabolic Safety Floors

To protect long-term metabolic health and avoid muscle wasting, SparkyFitness checks all calorie goals against safety limits:

1.  **Resting Metabolism (RMR) Floor:** Your target should not fall below your resting metabolic rate.
2.  **Absolute Clinical Floor:** $1,200$ kcal for biological females; $1,500$ kcal for biological males.

> [!IMPORTANT]
> **Enforcement Behavior:**
> *   Under the **Adaptive** method, if your calculated target falls below the safety floor, the system **automatically raises** your target to the effective floor.
> *   Under the **Manual** method, the target is **not automatically raised**, but a prominent warning banner is displayed warning you that your budget is in an unsafe range.
