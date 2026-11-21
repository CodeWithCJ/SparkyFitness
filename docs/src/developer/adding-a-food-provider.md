# Adding a Food Provider

This guide explains how to add a new external food database to SparkyFitness using the generic food provider framework.

## Architecture

Food data sources in SparkyFitness provide search, nutritional detail lookups, and optional barcode matching.
The provider framework decouples provider implementations via a clean adapter contract:

```
SparkyFitnessServer/integrations/foodProviders/
  types.ts           FoodProviderAdapter, ProviderCallContext, MappedProviderFood
  registry.ts        FOOD_PROVIDER_ADAPTERS mapped type registry
  httpClient.ts      providerFetchJson (safe logging, SSRF protection, Zod validation)
  per100gMapper.ts   buildPer100gFood (scales 100g base into portion variants)
  detailCache.ts     24h in-memory LRU cache to respect vendor rate limits
```

## Adding a Provider in 5 Steps

### 1. Register Type in `@workspace/shared`

In `shared/src/constants/foodProviderTypes.ts`:
- Add provider ID to `FOOD_PROVIDER_TYPES`.
- Add an entry in `FOOD_PROVIDER_REGISTRY` configuring display name, shortName, credentials type (`'none'`, `'api_key'`, `'app_id_and_key'`, `'base_url_and_key'`), portalUrl, apiKeyUrl, and optional `foodPageUrl`.

### 2. Implement the Server Adapter

Create `SparkyFitnessServer/integrations/<name>/<name>Service.ts` implementing `FoodProviderAdapter`:
- `search(ctx, query, page, pageSize)`: queries vendor search endpoint, returns items with `PARTIAL_SERVING_DATA`. Never enrich every row with a detail call during search (protects API quota).
- `getDetails(ctx, externalId, opts)`: fetches full nutritional profile, mapped via `buildPer100gFood`, with results cached in `foodProviderDetailCache`.
- `lookupBarcode(ctx, barcode)` (optional): returns matching food or null.

Register the adapter in `SparkyFitnessServer/integrations/foodProviders/registry.ts`. TypeScript's mapped type requires all registered provider types to have an adapter.

### 3. Add Database Migration

Create an idempotent migration in `SparkyFitnessServer/db/migrations/<timestamp>_add_<name>_provider_type.sql` inserting a row into `external_provider_types`:
- `categories = ARRAY['food']`
- `required_fields`, `field_labels`
- `is_strictly_private = FALSE`
- `supports_barcode = TRUE` (if supported)

### 4. Automated Tests

- Write unit tests in `SparkyFitnessServer/tests/<name>Service.test.ts` using recorded sanitized fixtures (strip API keys).
- Add a test case to `tests/chatbotToolsFood.test.ts` verifying tool invocation.
- Ensure `tests/foodProviderRegistry.test.ts` passes.

### 5. Frontend & Documentation

- Add English localization keys in `SparkyFitnessFrontend/public/locales/en/translation.json` under `settings.foodProviders.<name>`.
- Create user-facing documentation in `docs/src/features/settings/<name>.md`.
- Update `docs/src/features/settings/external-providers.md` and `docs/src/developer/food-provider-images.md`.
