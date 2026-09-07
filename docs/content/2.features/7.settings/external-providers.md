# External Providers

SparkyFitness supports integration with external health and fitness data providers to automatically sync your activity and measurements.

---

## Supported Providers

SparkyFitness supports integration with the following health and fitness data providers:

- Apple Health (iOS)
- Google Health Connect (Android)
- Fitbit
- Garmin Connect
- Oura Ring
- Withings
- Polar Flow (partially tested)
- Hevy (not tested)
- OpenFoodFacts
- USDA
- Fatsecret
- Nutritionix
- Mealie
- Tandoor
- Strava (partially tested)

## Open Food Facts Accounts and Contributions

Open Food Facts searches work without an account. Adding both an Open Food Facts username and password lets SparkyFitness publish an individual product only after you review its exact preview and confirm the data and photo rights. This first release supports manual contributions, one product at a time.

You can configure credentials in either place:

- **Personal:** Go to **Settings → Food & Exercise Data Providers** and add or edit an active Open Food Facts provider. The contribution card lets you save the two-letter language of your product packaging. A personal account takes priority over a global account.
- **Server-wide:** An administrator can open **Administration → Global Data Providers** and enable **Allow Open Food Facts contributions on this server**. An active global Open Food Facts account is an optional fallback for users without a personal account. The server gate is disabled by default. Enabling it or saving credentials does not publish any products or provide consent for users.

Credentials are encrypted at rest. Both username and password are required for contributions, and credentialed contribution endpoints must use HTTPS. Self-hosted HTTP instances remain available for unauthenticated searches.

For sandbox testing, set the provider URL to `https://world.openfoodfacts.net`. SparkyFitness automatically supplies the staging server's documented `off:off` HTTP Basic gate. Open Food Facts production and staging accounts are separate, so the provider must use an account registered on the selected environment.

To contribute a product:

1. Create or edit your own custom food and choose **Save and preview contribution**, or open the saved food's menu and select **Contribute to Open Food Facts**. The food is saved locally before the contribution dialog opens.
2. Select a fresh photo you took of the product's front, nutrition label or packaging. Choose what the photo shows and check the two-letter product language. JPEG, PNG and WebP photos are converted to JPEG and image metadata is removed. The photo must be clear enough to read; tiny images are rejected.
3. Choose **Preview contribution**. Review the destination product link, whether the product already exists, which account will publish, the sanitized photo and every outgoing field. Open the existing public product to compare its current information.
4. Separately confirm that you entered and verified the packaging data and that you took and own the photo. Then choose **Publish this contribution**. Both confirmations start unchecked for every new preview.

SparkyFitness sends the product name, brand, barcode, serving information and eligible nutrition from the default variant. Only custom products entered locally from physical packaging are eligible. Imported data, including products downloaded from Open Food Facts or proprietary third-party databases, is excluded. A non-internal, checksum-valid barcode, product name and metric-convertible default serving are required. Unknown nutrients are not turned into zeroes. The server rechecks ownership and eligibility before publication; family delegates cannot contribute someone else's food.

The preview is valid for ten minutes. Changing the photo, photo type or language clears the preview and its confirmations. If the food, publishing account or public product changes, request and review a fresh preview. Preparing or cancelling a preview does not change Open Food Facts, and ordinary food saves, setting changes, diary entries and deletions never publish or queue contributions. There is no bulk contribution action or automatic retry in this release.

The photo is published first. If it succeeds but the structured data result cannot be confirmed, the result explicitly reports **Photo published; product data unconfirmed** with a link to inspect the public product. The data may already have been saved, for example when the response times out. The local food remains saved. Inspect the destination before starting a new contribution; an uncertain result is never retried automatically.

Submitted data is covered by the Open Food Facts Open Database License (ODbL) and Database Contents License; photos are published under CC BY-SA. Review the [Open Food Facts Contributor Terms](https://world.openfoodfacts.org/terms-of-use) before confirming a contribution. Existing food images and arbitrary image URLs are never reused automatically.

---

## Contributing Mock Data

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by providing anonymized mock data.

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share your mock data to help us improve the sync logic!
