# CookTool Food Database

CookTool is a comprehensive food nutrition API providing access to canonical ingredients, national food tables, and over 2 million branded products.

SparkyFitness integrates with CookTool for **live food search**, **nutritional detail lookup**, and **barcode scanning**.

---

## Key Capabilities

* **Extensive Product Database**: Access to thousands of reference ingredients and over 2 million branded products.
* **Barcode Scanning**: Scan product barcodes (UPC-A, EAN-13, and GTIN-14) directly into your diary.
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

Once active, CookTool will appear in food search results and barcode lookup throughout the web and mobile apps.
