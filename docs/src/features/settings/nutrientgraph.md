# NutrientGraph Food Database

NutrientGraph is a source-checked food reference data API covering USDA Foundation, SR Legacy, and FNDDS foods, the French ANSES-CIQUAL database, and over 430,000 US branded products. Names are available in five languages: English, French, German, Italian, and Spanish.

SparkyFitness integrates with NutrientGraph for **live multi-lingual food search**, **detailed nutrient panels**, and **barcode lookups**.

---

## Key Capabilities

* **Multi-Database Coverage**: Query USDA generic foods, French CIQUAL reference foods, and US branded products in a single search.
* **Multilingual Names**: Food titles are served in your preferred language (`en`, `fr`, `de`, `it`, `es`).
* **Barcode Scanning**: Look up branded items directly by GTIN-8, UPC-A, EAN-13, or GTIN-14.
* **Smart Caching**: Food details are cached locally for 24 hours to conserve quota.
* **Source Attribution**: CIQUAL reference data is provided by ANSES under Licence Ouverte; USDA data is public domain.

---

## Getting an API Key

1. Sign up for an account at [nutrientgraph.com](https://nutrientgraph.com/signup/).
2. A free plan includes 2,500 monthly units.
3. Obtain your API key from the dashboard.

---

## Configuration in SparkyFitness

1. In SparkyFitness, navigate to **Settings → External Providers** (or **Administration → Global Data Providers**).
2. Click **Add Provider** and select **NutrientGraph**.
3. Enter your API key into the **NutrientGraph API key** field.
4. Save the provider.

Once enabled, NutrientGraph will appear in diary search and barcode lookup across Web and Mobile.
