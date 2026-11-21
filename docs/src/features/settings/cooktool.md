# CookTool Food Database

CookTool is a food nutrition API providing access to canonical ingredients and national food tables.

SparkyFitness integrates with CookTool for **live food search** and **nutritional detail lookup**.

---

## Key Capabilities

* **Extensive Ingredient Database**: Access to thousands of reference ingredients and food tables.
* **Smart Caching**: Retrieved food nutrition data is cached locally for 24 hours to conserve API quota.
* **Privacy Focused**: Uses your personal CookTool API key, keeping credential management under your control.

---

## Getting an API Key

1. Sign up for an account at [api.cooktool.org](https://api.cooktool.org/).
2. Navigate to your dashboard and generate an API key.
3. The free plan includes 1,000 requests per day.

---

## Configuration in SparkyFitness

1. In SparkyFitness, navigate to **Settings → External Providers** (or **Administration → Global Data Providers** for an instance-wide provider).
2. Click **Add Provider** and select **CookTool**.
3. Enter your CookTool API key into the **CookTool API key** field.
4. Save the provider.

Once active, CookTool will appear in food search results throughout the web and mobile apps.
