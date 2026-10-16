# Swedish Food Agency (Livsmedelsverket)

The Swedish Food Agency (*Livsmedelsverket*) publishes the authoritative Swedish Food Composition Database (*Livsmedelsdatabasen*). It contains nutritional values for approximately 2,600 foods and over 50 nutrients per item, reflecting typical foods consumed in Sweden.

SparkyFitness provides native support for Livsmedelsverket with both **live on-demand search** and **high-speed offline bulk catalog import**.

## Features

* **Zero Configuration**: Enabled globally as a default provider with no API keys, accounts, or credentials required.
* **Bilingual Support**: Search and import items in **Swedish (Svenska)** (`sprak=1`) or **English** (`sprak=2`).
* **EuroFIR Nutrient Standards**: Mapped directly from official EuroFIR codes (Energy in kcal and kJ, Protein, Fat, Saturated/Polyunsaturated/Monounsaturated Fatty Acids, Carbohydrates, Fiber, Sugars, Sodium, Potassium, Calcium, Iron, Vitamins A, C, D, etc.).
* **Standard 100g Reference Basis**: Base profiles reference 100g edible portions.
* **Bulk Catalog Import & Sync**: Instance administrators can import the complete catalog into their personal food library for instant offline access.
* **Safe Library Purge**: A dedicated purge option lets you delete all Livsmedelsverket items from your library at any time without deleting your past food diary history.

## Default Provider Availability

The Swedish Food Agency is included as a **default global provider** on every SparkyFitness instance. All users can immediately search and log Swedish foods from both the Web and Mobile apps without any configuration.

Administrators can view and manage the provider under **Settings → Food & Exercise Data Providers**.

## Using Livsmedelsverket

Once the provider is active, Swedish Food Agency results stream in automatically when you search for foods:

* **Web**: Appears under the **Swedish Food Agency (Livsmedelsverket)** section in the food search dialog, or when selecting the provider filter.
* **Mobile**: Select **Swedish Food Agency** from the online provider filter on the food search screen.

## Bulk Catalog Import

Instance administrators can import the database into their food library:

1. Navigate to **Settings → Food & Exercise Data Providers**.
2. Locate the **Swedish Food Agency (Livsmedelsverket)** provider card.
3. Click **Bulk Import / Sync**.
4. Choose your preferred language:
   * **Svenska (Swedish)**: Official Swedish food names and nutrient labels.
   * **English**: Translated names and nutrient descriptions.
5. Select the **Sync Mode**:
   * **Library foods only (recommended)**: Inserts and updates items in your personal food library. Past diary entries are preserved untouched.
   * **Library foods and refresh past diary entries**: Also recalculates existing food diary entries logged from Livsmedelsverket foods.
6. Click **Start Import**. The background worker will stream the catalog in batches with real-time progress.

## Clearing / Purging the Library

To remove imported Swedish Food Agency items from your library:

1. Open the bulk import dialog by clicking **Bulk Import / Sync**.
2. Click **Purge Library Foods**.
3. Confirm the deletion. All library items from Livsmedelsverket will be deleted while keeping past food diary entries intact.

## Licensing and Attribution

The Swedish Food Composition Database is published by the Swedish Food Agency (*Livsmedelsverket*) under the **Creative Commons Attribution 4.0 International (CC BY 4.0)** license.

* **License**: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)
* **Official Open Data Portal**: [Livsmedelsverket Food Composition Data](https://www.livsmedelsverket.se/en/about-us/open-data/food-composition-data/)
* **Interactive Search Portal**: [Sök näringsinnehåll](https://soknaringsinnehall.livsmedelsverket.se/)
* **Swagger API Specification**: [Livsmedelsverket Swagger Documentation](https://dataportal.livsmedelsverket.se/livsmedel/swagger/index.html)
