# External Providers

SparkyFitness supports integration with external health and fitness data providers to automatically sync your activity and measurements.

---

## Supported Providers

SparkyFitness supports integration with the following health and fitness data providers:

- Apple Health (iOS)
- Google Health Connect (Android)
- HUAWEI Health (web/cloud linking)
- Fitbit
- Garmin Connect
- Withings
- Polar Flow (partially tested)
- Hevy (not tested)
- OpenFoodFacts
- USDA
- Fatsecret
- Nutritioninx
- Mealie
- Tandori
- Strava (partially tested)

HUAWEI Health users can link from the SparkyFitness web app. The browser does
not connect to the watch over Bluetooth: the wearable first syncs with the
HUAWEI Health phone app, Huawei cloud receives that data, and SparkyFitness
imports the data authorized by the account owner. See the
[HUAWEI Health setup and privacy guide](/features/settings/huawei-health).

---

## Contributing Mock Data

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by providing anonymized mock data.

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share your mock data to help us improve the sync logic!
