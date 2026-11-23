# Food Info REST API

Food Info is a versioned REST API (`/api/v1`) providing programmatic access to reference nutrition data and full nutrient panels across multiple national food composition datasets.

SparkyFitness integrates with Food Info for **live on-demand food search** and **rich nutrient panel lookup**.

---

## Key Capabilities

* **Reference Food Search**: Query foods across six national databases by description.
* **Full Nutrient Panels**: Retrieve complete nutrient breakdowns including proximates, vitamins, minerals, and fatty acid groups.
* **Household Portions**: Supports standard 100g base reference profiles along with item-specific serving variants.
* **Quota-Friendly Caching**: Retrieved food panels are cached locally for 24 hours to stay well within free tier limits.

---

## Getting an API Key

1. Sign up for a free account at [food-info.org](https://food-info.org/developer).
2. Generate an API key from the developer dashboard.
3. The free plan provides 10 requests per minute and 100 requests per day.

---

## Configuration in SparkyFitness

1. In SparkyFitness, navigate to **Settings → External Providers** (or **Administration → Global Data Providers**).
2. Click **Add Provider** and select **Food Info**.
3. Enter your API key into the **Food Info API key** field.
4. Save the provider.

Once active, Food Info will appear in food search results across the web and mobile apps.
