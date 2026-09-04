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

Open Food Facts searches work without an account. Adding both an Open Food Facts username and password lets SparkyFitness contribute improvements through that authenticated account after you explicitly enable automatic contributions.

You can configure credentials in either place:

- **Personal:** Go to **Settings → Food & Exercise Data Providers** and add or edit an Open Food Facts provider. Then enable **Automatically contribute eligible products** in the separate Open Food Facts contribution card. A personal account takes priority over a global account.
- **Server-wide:** An administrator can open **Administration → Global Data Providers**, add or edit an active Open Food Facts provider, and enable **Allow automatic Open Food Facts contributions on this server**. This makes the account available as a fallback, but it does not opt anyone in. Each user must still enable uploads in their own settings. Both the server setting and every user's preference are disabled by default.

Credentials are encrypted at rest. Both username and password are required for contributions, and credentialed contribution endpoints must use HTTPS. Self-hosted HTTP instances remain available for unauthenticated searches.

For sandbox testing, set the provider URL to `https://world.openfoodfacts.net`. SparkyFitness automatically supplies the staging server's documented `off:off` HTTP Basic gate. Open Food Facts production and staging accounts are separate, so the provider must use an account registered on the selected environment.

When automatic contributions are enabled, adding or editing an eligible food queues it for a background upload. Enabling the option also queues your existing eligible foods, so no separate backfill action is required. Saving the food remains fast and succeeds even if Open Food Facts is unavailable; failed uploads are retried in the background.

SparkyFitness sends the product name, brand, barcode, serving information, and the default variant's nutrition. Foods without a valid barcode, product name, or default serving are skipped. Diary entries and deletions do not create Open Food Facts changes.

Only product data entered locally from physical packaging is eligible. Imported data, including products downloaded from Open Food Facts or proprietary third-party databases, is skipped so SparkyFitness never republishes rounded or stale copies. Submitted database content is covered by the Open Food Facts Open Database License (ODbL) and Database Contents License. Open Food Facts publishes contributed images under CC BY-SA, but SparkyFitness never uploads photos automatically. Review the [Open Food Facts Contributor Terms](https://world.openfoodfacts.org/terms-of-use) before enabling automatic contributions.

Photos are never uploaded automatically because image publication requires separate rights confirmation. The contribution card shows pending, processing, failed, and successfully published counts together with recent errors. Disabling your personal opt-in removes its queued work; enabling it later starts a fresh eligible backfill. Disabling the server setting stops automatic uploads for everyone without changing anyone's personal preference.

---

## Contributing Mock Data

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by providing anonymized mock data.

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share your mock data to help us improve the sync logic!
