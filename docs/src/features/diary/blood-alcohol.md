# Estimated Blood Alcohol

SparkyFitness can draw an **estimated** blood alcohol concentration (BAC) curve for a day, based on the drinks you log. It is a curiosity feature: it shows roughly how the alcohol you logged rises and falls over time.

::: danger This is a rough estimate, not a measurement
The value is calculated from averages, not measured in your blood. Your real value can differ by **20% or more** in either direction, because of food in your stomach, medication, liver function, how fast you drank and many other factors.

**Never use this estimate to decide whether you are fit to drive, operate machinery or do anything else that needs you to be sober.** For this reason SparkyFitness never predicts a time for your alcohol level. If you have been drinking, do not drive.
:::

## What the estimate uses

- **Your logged drinks**: every food or drink in your diary with an alcohol amount (grams of alcohol), at the time you logged it. An entry without its own time uses the default time of its meal, or 12:00 when the meal has none; the card marks those drinks as having an assumed time. Drinks from up to 24 hours before the selected day also count, so a late drink the evening before still shows the next morning.
- **Your body**: sex, weight, height and age, depending on the formula you choose (see below). Set your gender, date of birth and height under **Settings → Profile & Account → Profile Information**, and log your weight in [Check-in](/features/check-in).

When the chosen formula needs something your profile does not have, the card does not guess. It says which values are missing (sex, weight, height or age; sex is the **Gender** field in your profile) and where to set them. A weight or height that gives an impossible result (for example a typo) is also reported instead of being used.

## How it is calculated

The estimate follows the Widmark model: the alcohol from a drink spreads through the water in your body, so the concentration is the grams of alcohol divided by your body weight times a **distribution factor** (Widmark's _r_). Each drink is absorbed over roughly an hour, and your liver then removes a fixed amount per hour, so the curve falls in a straight line.

### Distribution formula

The formula decides how the distribution factor is worked out from your body. You can choose one of four:

| Formula              | Needs                                | How it works                                                                                                                                      |
| :------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Watson** (default) | Sex, weight, height, and age for men | Estimates total body water from your body, then turns it into the distribution factor. [Watson et al. 1980](https://doi.org/10.1093/ajcn/33.1.27) |
| **Widmark**          | Sex, weight                          | The original fixed factors: 0.68 for men and 0.55 for women. [Overview: Posey & Mozayani 2007](https://doi.org/10.1385/FSMP:3:1:33)               |
| **Seidl**            | Sex, weight, height                  | A factor from height and weight, fitted to measured values. [Seidl et al. 2000](https://doi.org/10.1007/s004140000154)                            |
| **Forrest**          | Sex, weight, height                  | A factor from your body mass index (BMI). [Forrest 1986](<https://doi.org/10.1016/S0015-7368(86)72491-2>)                                         |

The formulas that use height and weight usually fit a person better than Widmark's fixed factors, but none of them knows your real body composition.

### Elimination rate

The elimination rate is how much your liver removes per hour, in per mille per hour (‰/h). The default is **0.15 ‰/h**, a commonly used average. You can set any value from **0.10 to 0.25 ‰/h**. Only change it if you have a reason to; a higher value does not make the estimate safer.

### Display unit

Choose how the value is shown:

- **Per mille (‰)**: grams of alcohol per kilogram of blood, common in Europe. This is the default.
- **Percent (%)**: common in the United States. 0.5 ‰ is shown as 0.05 %.

The values are always stored in per mille; the unit only changes the display.

Set the formula, elimination rate and display unit on the web under **Settings → Profile & Account → Preferences**. They are saved to your account, so web and mobile show the same estimate.

## Show the card

The card is **hidden by default**. Turn it on where you want to see it:

- **Web**: on the Diary, choose **Customize layout** and add the estimated blood alcohol widget.
- **Mobile**: open **Dashboard Settings** and turn on the estimated blood alcohol card.

The card shows the curve for the selected day, the current estimate and the day's peak, always with the disclaimer above.

## Privacy and sharing

The estimate is **only available to you**. Family and friends with diary access cannot see it, and it is not shown when you view someone else's diary. The [AI assistant and MCP server](/features/mcp-server) can read your estimate for you; their answers always carry the same disclaimer and never predict a time for your alcohol level.

## Health apps

The estimate uses only the drinks logged in SparkyFitness. Health Connect on Android has no alcohol consumption data, so nothing is imported there for this card.
