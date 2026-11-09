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
- [Intervals.icu](/features/settings/intervals)
- [Canadian Nutrient File (Health Canada)](/features/settings/canadian-nutrient-file)
- [Swedish Food Agency (Livsmedelsverket)](/features/settings/livsmedelsverket)
- Swiss Food Composition Database
- OpenFoodFacts
- USDA
- Fatsecret
- Nutritionix
- Mealie
- [Valhalla routing](/features/exercises/route-generation) (route generation and Follow roads; a base URL and an optional API key)
- [Weather (Open-Meteo compatible)](/features/exercises/gps-activity-recording#weather) (adds the temperature and conditions to GPS-recorded activities; a base URL and an optional API key; nothing is looked up until you add one)
- Tandoor
- Strava (partially tested)
- [COROS](/features/settings/coros)
- NIH Dietary Supplement Label Database (fills in a supplement from its barcode; public, no key, active by default — deactivate it to turn it off). Open Food Facts is the fallback for supplement barcodes the NIH database does not have, mostly outside the US; with both off the supplement barcode scan is hidden

## Mealie ingredient meals

Mealie recipes can be imported as editable meals with separate ingredients. The existing option to import a recipe as a single food remains available.

1. Add an active Mealie provider under **Settings → Food & Exercise Data Providers**, using your Mealie instance URL and API token.
2. Open your meals library and choose **Import Mealie ingredients**. Select the provider and recipe.
3. Match each ingredient to a food with nutrition data. You can search manually or request suggestions. Optional AI matching uses your configured AI service to choose from retrieved foods; review and confirm each selection before saving. Confirmed matches are remembered for the same ingredient and preparation context.
4. Check the quantities and units for the whole recipe. For weighed portions, enter the finished weight of the entire cooked dish in grams, without the pot. Save the meal, then log the amount you ate through the normal meal diary.

Missing amounts, incompatible units and linked sub-recipes are shown for review. SparkyFitness does not guess a volume-to-weight conversion. Recipes containing a linked sub-recipe require its ingredients to be listed explicitly in Mealie before import. Missing optional nutrients remain unknown rather than becoming zero.

Every selected food variant needs known **calories, protein, carbohydrates and fat** before saving; a measured zero is valid. Incomplete mappings stay editable: choose a complete variant or correct the food's nutrition, then review it again. Unknown optional nutrients do not prevent import or sync and are not written as zero.

Remembered matches include the source's original preparation text. A change from cooked to dry requires fresh confirmation; changes only to the structured quantity can reuse an unchanged context. Older matches that did not record this context require one fresh review. Repeated rows with indistinguishable food, unit and preparation context always require individual confirmation, because they may use different food variants; those ambiguous contexts are not learned for later automatic reuse.

If saving times out or returns an uncertain server error, check the meals library before starting again. Retry is blocked within that review, but reopening starts a new import and can create another meal. Deliberate repeated imports remain supported; imports do not have an exactly-once guarantee across reopened reviews.

### Updating nutrition in Mealie

Saving or editing a meal does not write to Mealie. After importing, use the separate nutrition-sync action to update the original recipe's nutrition. Your Mealie token must permit recipe updates.

Sync is available only when all ingredients are confirmed, the amounts still match the original recipe, the imported meal's ingredients and nutrition are unchanged, and the source matches its imported or last successfully synced version. A successful sync records the new baseline, so another unchanged sync is allowed. For new imports, comments and update timestamps do not count as recipe edits; ingredient, serving, preparation, instruction and nutrition changes do. Older imports without the stable baseline retain the stricter full-source check and may need a fresh import after metadata changes.

SparkyFitness updates only supported, known nutrition fields, calculated per original recipe serving, and includes existing optional nutrient values to preserve them. **Avoid editing the recipe in Mealie while syncing.** Mealie's nutrition update replaces the nested nutrition object and provides no verified atomic conflict check in this integration: another client's edit between the read and write can be overwritten despite the before/after checks. Ingredient amounts and other recipe content are not sent in the update.

If you substitute an ingredient or change an amount for one cooking session, keep that variation in your SparkyFitness meal. For a permanent alternative recipe, duplicate and edit the recipe in Mealie, then import that copy. Import and sync use your own provider connection and are unavailable while managing another person's profile.

A source conflict requires a fresh import and review. If the remote result cannot be confirmed, inspect the recipe in Mealie before trying again: a timed-out update may already have reached it. The saved SparkyFitness meal remains available even when sync fails.

If Mealie confirms the update but SparkyFitness cannot record the successful sync, the action reports that partial outcome rather than success. Check Mealie and import its current unchanged recipe as a new base meal. The old baseline is not silently replaced with unverified remote edits to make a retry pass.

::: details Android example with a test recipe

The ingredient import is available from the meals library. In this example, the saved whole dish weighs **1,800 g** and contains **2,400 kcal**. Logging **450 g** through the normal meal flow records **600 kcal**.

![Mealie ingredient import in the Android meals library](/integrations/mealie/ingredients-after.png)

![A 450 g portion calculated as 600 kcal](/integrations/mealie/weighed-portion.png)

:::

## Hevy automatic sync

When adding or editing a Hevy provider, choose **Manual**, **Hourly**, or **Daily at 21:00** under **Sync Frequency**. New connections default to **Manual**, and existing manual connections stay manual until you change the setting. Keep the provider active to enable automatic sync.

**Daily at 21:00** uses the timezone saved in your SparkyFitness preferences. The server checks hourly and runs the sync at or after 21:00, once per local evening. If an evening attempt fails, a later hourly check can retry before midnight. Only a successful live sync at or after 21:00 whose date range includes the current local day, including a manual sync, counts for that evening. A sync earlier in the day or limited to other dates does not replace the evening run, so today's workouts can still be imported. The server must be running during the evening; missed days are not automatically caught up after midnight.

**Hourly** keeps the existing hourly schedule. You can still use **Sync** manually with any frequency.

Hevy exercise templates also supply the primary and secondary muscle groups used in exercise reports. The importer matches templates by their Hevy ID and fills missing muscle information on your Hevy exercises while preserving populated fields. To add muscle information to workouts imported by an older version, run a full-history sync once so their diary snapshots are rebuilt with the exercise metadata.

Muscle metadata is best effort: if Hevy's template catalogue or a muscle update is unavailable, the workouts still import. Later syncs can fill missing muscles. The catalogue is skipped when all referenced Hevy exercises already have primary muscles, and unchanged library rows are not rewritten. An existing exercise of your own with the same name can be reused without changing its source or muscle fields; global public exercises and other users' exercises are not reused by this importer.

## Canadian Nutrient File (Health Canada)

The Canadian Nutrient File (CNF) is Health Canada's official food composition database containing ~5,700 items with complete macronutrient, micronutrient, and household portion profiles. It is completely free, public, and requires no API keys or accounts.

SparkyFitness supports both **live on-demand search** across the official Health Canada API in English and French, as well as **offline bulk catalog import** to cache the entire catalog locally.

For setup instructions, import options, and licensing information, see the [Canadian Nutrient File Documentation](/features/settings/canadian-nutrient-file).

## Swedish Food Agency (Livsmedelsverket)

The Swedish Food Agency (_Livsmedelsverket_) publishes the authoritative Swedish Food Composition Database (_Livsmedelsdatabasen_) containing ~2,600 analyzed and calculated food items with over 50 nutritional components each. It is free open data licensed under Creative Commons Attribution 4.0 (CC BY 4.0), requires no credentials or API keys, and is enabled by default.

SparkyFitness supports both **live on-demand search** across the official open data API in Swedish and English, as well as **offline bulk catalog import** to cache the entire catalog locally.

For setup instructions, import options, and licensing information, see the [Swedish Food Agency Documentation](/features/settings/livsmedelsverket).

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
