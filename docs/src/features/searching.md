# Searching

You'll use the same kind of search box in several places: when adding food to a meal, when logging an exercise, and in the food and exercise libraries. This page explains how search works; the detailed walkthroughs live on the [Food Search](/features/food/food-search) and [Exercise Search](/features/exercises/exercise-search) pages.

## Where you can search

| Where | What you're searching for |
| --- | --- |
| Diary → meal → **Add food** | Foods from your library, online providers, or a barcode |
| Diary → **Add Exercise** | Exercises to log |
| Foods page | Your food library, including meals |
| Exercise page → **Add Exercise** | Import exercises from online providers, or create custom exercises |
| Medications, meal builders, water containers | Quick lookups of foods and exercises |

## The common ingredients

Most search screens share these building blocks:

- **Recent**: the items you've used lately, shown before you even type
- **Favorites / Frequent**: foods you've marked as favorites and the ones you log most often
- **Ownership filter**: narrow results to **All**, **My Foods** (or **My Exercises**), **Family**, or **Public**
- **Provider selector**: choose which data source to search, or **All Providers** to search everything at once
- **Barcode scan**: on the food search, the **Scan Barcode** button opens your camera and looks up the product's barcode (see below)

## Searching online vs. your library

Searches have two sources:

- **Internal**: your own library plus anything shared with you by family members and shared publicly
- **External**: live searches against the food or exercise data providers you've configured in **Settings → Developer & Integrations → Food & Exercise Data Providers**. Pick a provider (or **All Providers** for foods) and results are imported into your library when you add them.

See [External Providers](/features/settings/external-providers) for setup, and [Feature Comparison](/features/comparison) to choose between food data sources. Foods from the free, no-setup **Canadian Nutrient File** are covered in its own guide: [Canadian Nutrient File](/features/settings/canadian-nutrient-file).


## Barcode scanning

On the food search, press **Scan Barcode**, point your camera at the product barcode, and SparkyFitness looks it up:

- You can pick which provider performs the lookup
- The default lookup provider is set under **Settings → Developer & Integrations → Food & Exercise Data Providers** as the **Default Barcode Provider**
- If no provider is configured, the first barcode-capable provider is used
- The scanned product appears as a **Scanned product** card; add it and it becomes part of your library

> [!NOTE]
> Barcode results depend on the provider's coverage. If a barcode isn't found, fall back to a normal text search or create a [custom food](/features/food/custom-food-form).

## Related pages

- [Food Search](/features/food/food-search)
- [Exercise Search](/features/exercises/exercise-search)
- [Food Database Manager](/features/food/food-database-manager)
- [Exercise Database Manager](/features/exercises/exercise-database-manager)
- [External Providers](/features/settings/external-providers)
- [Canadian Nutrient File](/features/settings/canadian-nutrient-file)
- [Feature Comparison](/features/comparison)
