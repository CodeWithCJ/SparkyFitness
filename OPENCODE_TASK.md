# Opencode Task: Fix YAZIO Provider Credentials & Prepare Split PRs

## Working Directory
`/home/ubuntu/sparkyfitness-develope`

## Current Branch
`feature/yazio-provider-1442`

## Context
We're working on the SparkyFitness monorepo. The YAZIO food provider integration is mostly done but has several issues that need fixing. The current branch already has one commit ahead of `fork/feature/yazio-provider-1442`.

## Issues to Fix

### Issue 1: YAZIO Client ID and Secret not being saved

**Problem**: When a user saves YAZIO provider settings, they get the error: "YAZIO is not available because this provider is missing YAZIO Client ID and/or Client Secret."

**Root cause**: The server-side validation in `SparkyFitnessServer/services/externalProviderService.ts` has `validateYazioProviderCredentials()` which requires BOTH login credentials (username+password) AND client credentials (clientId+clientSecret). But the user should be able to provide ONLY client credentials without email/password.

**Files to fix**:

1. **`SparkyFitnessServer/services/externalProviderService.ts`**:
   - `validateYazioProviderCredentials()` currently requires both login AND client credentials. Change it so that EITHER login credentials (username+password) OR client credentials (clientId+clientSecret) are sufficient. At least one pair must be present.
   - `hasYazioLoginCredentials()` and `hasYazioClientCredentials()` are fine as-is.
   - The validation should throw if NEITHER pair is complete.

2. **`SparkyFitnessServer/integrations/yazio/yazioService.ts`**:
   - `requireCredentials()` currently requires both username+password AND clientId+clientSecret. Make username+password optional — only clientId+clientSecret should be strictly required for the API to work.
   - Update the error message to reflect that only Client ID + Secret are required.

### Issue 2: Email and Password fields should be optional for YAZIO

**Problem**: The frontend requires email/password for YAZIO, but theoretically only Client ID + Secret are needed.

**Files to fix**:

1. **`SparkyFitnessFrontend/src/utils/settings.ts`**:
   - In `providerRequirements`, change `yazio` from `['app_id', 'app_key', 'yazio_client_id', 'yazio_client_secret']` to `['yazio_client_id', 'yazio_client_secret']` (remove app_id and app_key from required fields).
   - The `validateProvider` function uses `providerRequirements` to check required fields, so this change makes email/password optional.

2. **`SparkyFitnessFrontend/src/pages/Settings/ProviderSpecificFields.tsx`**:
   - For the YAZIO section, add "(Optional)" to the Email/Username and Password labels.
   - Add helper text: "Email and password are optional. Only Client ID and Client Secret are required."

3. **`SparkyFitnessFrontend/src/pages/Settings/EditProviderForm.tsx`**:
   - Same changes: add "(Optional)" to YAZIO Email/Username and Password labels.
   - Add similar helper text.

4. **`SparkyFitnessFrontend/src/pages/Settings/AddExternalProviderForm.tsx`**:
   - The `handleAddProvider` function already handles YAZIO specially with `encodeYazioAppId` and `encodeYazioAppKey`. No changes needed here since it already passes the values correctly.

### Issue 3: Migration files cleanup (ALREADY DONE)

The migration `20260605122001_add_yazio_to_provider_type_check.sql` was already removed in the previous commit, and yazio is already included in `20260122201500_refactor_provider_type_to_lookup_table.sql`. No action needed.

### Issue 4: Yazio should only appear as food provider, not exercise

**Current state**: Already correct. In `settings.ts`, `getProviderCategory()` returns `['food']` for yazio. The `getProviderTypes()` list includes yazio as a general provider type. This is fine because the filtering happens at the category level. No changes needed.

### Issue 5: Prepare split PRs

After fixing the above issues, we need to prepare TWO separate PRs:

**PR 1: Web + Server changes (this branch)**
- All the fixes above
- Should NOT include any mobile changes
- The current branch already has mobile changes mixed in. We need to:
  1. Note which commits/files are mobile-only
  2. The web+server fix commits should stay on this branch

**PR 2: Mobile changes (separate branch)**
- Create a new branch `feature/yazio-provider-1442-mobile` from `fork/main`
- Cherry-pick or re-apply only the mobile-specific changes:
  - `SparkyFitnessMobile/src/hooks/useExternalFoodSearch.ts` - add yazio to FOOD_PROVIDER_TYPES
  - `SparkyFitnessMobile/src/screens/FoodScanScreen.tsx` - barcodeProviderId support
  - `SparkyFitnessMobile/src/screens/FoodSearchScreen.tsx` - yazio provider support, verified badge
  - `SparkyFitnessMobile/src/services/api/externalFoodSearchApi.ts` - yazio search, barcode lookup with providerId
  - `SparkyFitnessMobile/src/types/externalFoods.ts` - add provider_verified, serving_weight fields
  - `SparkyFitnessMobile/src/types/externalProviders.ts` - add yazio to FOOD_PROVIDER_TYPES and BARCODE_PROVIDER_TYPES
  - `SparkyFitnessMobile/src/types/navigation.ts` - add barcodeProviderId to FoodScan route
  - All test files in `SparkyFitnessMobile/__tests__/`

## Execution Order

1. Fix Issue 1: Server-side validation (externalProviderService.ts + yazioService.ts)
2. Fix Issue 2: Frontend optional fields (settings.ts, ProviderSpecificFields.tsx, EditProviderForm.tsx)
3. Run server tests to verify: `cd SparkyFitnessServer && pnpm test` (focus on yazio-related tests)
4. Run frontend validation: `cd SparkyFitnessFrontend && pnpm run validate`
5. Commit the fixes with message: "fix(yazio): make email/password optional, fix credential validation"
6. Prepare the mobile branch: create `feature/yazio-provider-1442-mobile` from `fork/main` and apply mobile-only changes

## Important Notes
- Do NOT modify any files in `SparkyFitnessMobile/` on the current branch
- After fixing, verify that `git diff fork/main...HEAD --stat` shows NO mobile files changed
- The server tests should pass. If they don't, fix them.
- Do NOT push anything, just prepare the branches locally
