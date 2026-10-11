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
- [Liftosaur](/features/settings/liftosaur)
- [Canadian Nutrient File (Health Canada)](/features/settings/canadian-nutrient-file)
- Swiss Food Composition Database
- OpenFoodFacts
- USDA
- Fatsecret
- Nutritionix
- Mealie
- Tandoor
- Strava (partially tested)
- [COROS](/features/settings/coros)
- NIH Dietary Supplement Label Database (fills in a supplement from its barcode; public, no key, active by default — deactivate it to turn it off). Open Food Facts is the fallback for supplement barcodes the NIH database does not have, mostly outside the US; with both off the supplement barcode scan is hidden

## Canadian Nutrient File (Health Canada)

The Canadian Nutrient File (CNF) is Health Canada's official food composition database containing ~5,700 items with complete macronutrient, micronutrient, and household portion profiles. It is completely free, public, and requires no API keys or accounts.

SparkyFitness supports both **live on-demand search** across the official Health Canada API in English and French, as well as **offline bulk catalog import** to cache the entire catalog locally.

For setup instructions, import options, and licensing information, see the [Canadian Nutrient File Documentation](/features/settings/canadian-nutrient-file).

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

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by capturing what the provider actually returned and sharing it.

### Capturing a sync

This is off by default and is admin-only.

1. As an admin, go to **Admin → Global Provider Settings** and turn on **Allow Local Provider Response Capture**.
2. Open **Settings → Integrations**, press **Sync** on the provider, and pick your date range as usual.
3. Two extra checkboxes appear in that dialog. Tick **Save this sync's raw responses to a file on the server** and run the sync.
4. The capture is written to `mock_data/<provider>_raw.json` inside the server container or install directory.
5. Turn the admin setting back off when you are done.

To replay a saved capture instead of calling the provider — useful for reproducing a bug without hitting the live API — tick **Sync from the previously saved file** instead.

::: warning
The capture is stored per provider, not per user, and contains raw health data: sleep, heart rate, GPS activity and nutrition. That is why it is admin-only and off by default. Review the file before sharing it, and turn the setting off once you have what you need.
:::

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share a capture to help us improve the sync logic!
