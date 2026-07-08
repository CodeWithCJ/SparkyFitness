# File & Domain Reference Map

Quick navigation guide for finding code by feature. Every feature domain follows the same folder structure across backend, frontend, and mobile.

---

## Domain-Mirror Architecture

Each feature area is organized identically across all three packages:

```
FEATURE_NAME/
├── Backend (SparkyFitnessServer/)
│   ├── routes/v2/featureRoutes.ts          → API endpoints
│   ├── schemas/FeatureSchema.ts            → Zod validation
│   ├── services/featureService.ts          → Business logic
│   ├── models/featureRepository.ts         → Database queries
│   └── tests/feature*.test.ts              → Route + service tests
│
├── Frontend (SparkyFitnessFrontend/src/)
│   ├── pages/Feature/                      → Screen components
│   ├── api/Feature/                        → API clients
│   ├── hooks/Feature/                      → React Query hooks
│   └── tests/Feature*/                     → Component + hook tests
│
├── Mobile (SparkyFitnessMobile/src/)
│   ├── screens/Feature*.tsx                → Screen components
│   ├── services/api/featureApi.ts          → API clients
│   ├── hooks/Feature/                      → Custom hooks
│   └── __tests__/Feature/                  → Component + hook tests
│
└── Shared (shared/src/)
    ├── schemas/database/Feature*.zod.ts    → Table schemas
    ├── schemas/api/Feature.api.zod.ts      → Request/response contracts
    └── constants/feature.ts                → Constants & enums
```

---

## Feature Domains

Use this to find code for any feature. All paths are **relative to the folder listed in the first column** — add repo root if needed.

### Food & Nutrition

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Foods** (library, custom) | `routes/v2/foodRoutes.ts` `services/foodService.ts` `models/foodRepository.ts` | `pages/Foods/` `api/Foods/` `hooks/Foods/` | `screens/Foods*.tsx` `services/api/foodsApi.ts` `hooks/Foods/` | `schemas/database/Foods.zod.ts` `schemas/api/Foods.api.zod.ts` |
| **Meals** (templates, logged) | `routes/v2/mealRoutes.ts` `services/mealService.ts` `models/mealRepository.ts` | `pages/Meals/` `api/Meals/` `hooks/Meals/` | `screens/Meal*.tsx` `services/api/mealsApi.ts` `hooks/Meals/` | `schemas/database/Meals.zod.ts` `schemas/api/Meals.api.zod.ts` |
| **Food Entries** (logged meals) | `routes/v2/foodEntryRoutes.ts` `services/foodEntryService.ts` `models/foodEntryRepository.ts` | `pages/Diary/` (food section) `api/Diary/foodEntryService.ts` | `screens/Food*.tsx` `services/api/foodEntriesApi.ts` | `schemas/database/FoodEntries.zod.ts` |

### Exercise & Workouts

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Exercises** (library, custom) | `routes/v2/exerciseRoutes.ts` `services/exerciseService.ts` `models/exerciseRepository.ts` | `pages/Exercises/` `api/Exercises/` `hooks/Exercises/` | `screens/Exercise*.tsx` `services/api/exerciseApi.ts` `hooks/Exercises/` | `schemas/database/Exercises.zod.ts` `schemas/api/Exercises.api.zod.ts` |
| **Workouts** (presets, sessions) | `routes/v2/workoutPresetRoutes.ts` `services/workoutService.ts` `models/workoutRepository.ts` | `pages/Exercises/` `api/Exercises/` `hooks/Exercises/` | `screens/Workout*.tsx` `services/api/workoutPresetsApi.ts` | `schemas/database/Workout*.zod.ts` |
| **Exercise Entries** (logged) | `routes/v2/exerciseEntryRoutes.ts` `services/exerciseEntryService.ts` `models/exerciseEntryRepository.ts` | `pages/Diary/` (exercise section) `api/Exercises/` | `screens/Workout*.tsx` `services/api/exerciseApi.ts` | `schemas/database/ExerciseEntries.zod.ts` |

### Measurements & Health

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Check-In** (weight, measurements) | `routes/checkInRoutes.ts` `services/checkInService.ts` `models/checkInRepository.ts` | `pages/CheckIn/` `api/CheckIn/` `hooks/CheckIn/` | `screens/Measurements*.tsx` `services/api/measurementsApi.ts` `hooks/CheckIn/` | `schemas/database/CheckInMeasurements.zod.ts` |
| **Water Intake** | `routes/waterRoutes.ts` `services/waterService.ts` `models/waterRepository.ts` | `pages/Diary/` (water) `api/Diary/waterIntake.ts` | `screens/Dashboard` (water card) `services/api/waterApi.ts` | `schemas/database/Water*.zod.ts` |
| **Custom Measurements** | `routes/customMeasurementRoutes.ts` `services/customService.ts` `models/customRepository.ts` | `pages/CheckIn/` `api/CheckIn/` | `screens/Measurements*.tsx` `services/api/measurementsApi.ts` | `schemas/database/CustomMeasurements.zod.ts` |

### Sleep, Fasting, Mood, Medications

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Sleep** (logs, stage data) | `routes/sleepRoutes.ts` `routes/sleepScienceRoutes.ts` `services/sleepService.ts` `models/sleepRepository.ts` | `pages/Reports/` (sleep section) `api/Reports/` | `screens/Dashboard` (sleep card) `services/api/healthDataApi.ts` | `schemas/database/Sleep*.zod.ts` |
| **Fasting** (logs, timers) | `routes/fastingRoutes.ts` `services/fastingService.ts` `models/fastingRepository.ts` | `pages/Fasting/` `api/Fasting/` `hooks/Fasting/` | `screens/Fasting*.tsx` `services/api/fastingApi.ts` `hooks/Fasting/` | `schemas/database/FastingLogs.zod.ts` |
| **Mood** (entries, mood tracking) | `routes/moodRoutes.ts` `services/moodService.ts` `models/moodRepository.ts` | `pages/CheckIn/` (mood section) `api/CheckIn/` | `screens/CheckIn*.tsx` `services/api/measurementsApi.ts` | `schemas/database/MoodEntries.zod.ts` |
| **Medications** (inventory, logs, symptoms) | `routes/v2/medicationRoutes.ts` `services/medicationService.ts` `models/medication*.ts` | `pages/Medications/` `api/Medications/` `hooks/Medications/` | `screens/Medications*.tsx` `services/api/medicationsApi.ts` | `schemas/database/Medication*.zod.ts` |

### Cycle & Pregnancy

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Cycle** (logs, predictions) | `routes/cycleRoutes.ts` `services/cycleService.ts` `models/cycleRepository.ts` | `pages/Cycle/` `api/Cycle/` `hooks/Cycle/` | `screens/Cycle*.tsx` `services/api/cycleApi.ts` | `schemas/database/Cycle*.zod.ts` |
| **Pregnancy** (logs, tracking) | `routes/pregnancyRoutes.ts` `services/pregnancyService.ts` `models/pregnancyRepository.ts` | `pages/Pregnancy/` `api/Pregnancy/` | `screens/Pregnancy*.tsx` `services/api/pregnancyApi.ts` | `schemas/database/Pregnancy*.zod.ts` |

### Reporting & Analytics

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Daily Summary** | `routes/dailySummaryRoutes.ts` `services/dailySummaryService.ts` `models/dailySummaryRepository.ts` | `pages/Reports/` `api/Diary/dailySummary.ts` | `screens/Dashboard*.tsx` `services/api/dailySummaryApi.ts` | `schemas/api/DailySummary.api.zod.ts` |
| **Goals & Progress** | `routes/goalRoutes.ts` `services/goalService.ts` `models/goalRepository.ts` | `pages/Goals/` `api/Goals/` `hooks/Goals/` | `screens/Dashboard` (progress) `services/api/goalsApi.ts` | `schemas/database/UserGoals.zod.ts` `schemas/api/Goals.api.zod.ts` |
| **Reports** (trends, charts) | `routes/reportRoutes.ts` `services/reportService.ts` | `pages/Reports/` `api/Reports/` | Dashboard + detail screens | — |

### Auth, Settings, Admin

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Auth** (login, MFA, passkeys) | `routes/authRoutes.ts` `routes/auth/*.ts` `auth.ts` | `pages/Auth/` `api/Auth/` `hooks/useAuth.tsx` | `screens/Onboarding*.tsx` `services/api/authService.ts` | `schemas/api/Auth.api.zod.ts` |
| **Profile & Preferences** | `routes/profileRoutes.ts` `services/profileService.ts` `models/profileRepository.ts` | `pages/Settings/` `api/Settings/` `hooks/useSettings.tsx` | `screens/Settings*.tsx` `services/api/profileApi.ts` | `schemas/database/Profiles.zod.ts` `schemas/database/UserPreferences.zod.ts` |
| **Admin** (global settings, logs) | `routes/adminRoutes.ts` `services/adminService.ts` `models/adminRepository.ts` | `pages/Admin/` `api/Admin/` | — | `schemas/database/AdminActivityLogs.zod.ts` |
| **Integrations** (providers, API keys) | `routes/integrationRoutes.ts` `integrations/*.ts` | `pages/Integrations/` `api/Integrations/` | `screens/Settings/Integrations*.tsx` `services/api/externalProvidersApi.ts` | `schemas/database/ExternalDataProviders.zod.ts` |

### AI & Chat

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Chat** (Sparky) | `routes/chatRoutes.ts` `services/chatService.ts` `ai/tools/` `ai/config.ts` | `pages/Chat/` `api/Chatbot/` `hooks/Chat/` | `screens/ChatScreen.tsx` `services/api/chatApi.ts` | `schemas/api/Chat.api.zod.ts` |
| **AI Photo Estimate** | `routes/photoRoutes.ts` `services/photoService.ts` `ai/providerDispatch.ts` | `pages/Foods/` (photo flow) `api/CheckIn/` | `screens/FoodPhoto*.tsx` `services/api/externalFoodSearchApi.ts` | `schemas/api/FoodPhotoEstimate.api.zod.ts` |

---

## Finding Code: Quick Search

**I need to fix a bug in [Feature]:**
1. Find the feature row in the table above
2. Check "Backend" — that's the route + service + repository files
3. Check "Frontend" or "Mobile" — that's the page + API client + hooks
4. Check "Shared" — that's the schema and types

**Example: Bug in fasting timer**
- Backend: `routes/fastingRoutes.ts`, `services/fastingService.ts`
- Mobile: `screens/Fasting*.tsx`, `services/api/fastingApi.ts`, `hooks/Fasting/`
- Shared: `schemas/database/FastingLogs.zod.ts`

**I need to add a new endpoint for [Feature]:**
1. Create/update in Backend (route + schema + service + repo)
2. Add Shared schema if needed
3. Update Frontend and Mobile API clients
4. Follow `agent-docs/testing-patterns.md` to test each layer

---

## Cross-Cutting Code (Not Domain-Specific)

| System | Location | Purpose |
|--------|----------|---------|
| **Database & RLS** | `SparkyFitnessServer/db/` | Migrations, RLS policies, pool management |
| **Auth Framework** | `SparkyFitnessServer/auth.ts` `SparkyFitnessServer/middleware/authMiddleware.ts` | Better Auth config, session handling |
| **Permissions** | `SparkyFitnessServer/middleware/checkPermissionMiddleware.ts` `SparkyFitnessServer/utils/permissionUtils.ts` | Family access, delegation logic |
| **Logging** | `SparkyFitnessServer/config/logging.ts` | Log level, formatting |
| **Shared Schemas** | `shared/src/schemas/` | Database tables, API contracts, constants |
| **Timezone Helpers** | `shared/src/utils/` `SparkyFitnessServer/utils/timezoneLoader.ts` | Day strings, UTC conversions |
| **UI Primitives** | `SparkyFitnessFrontend/src/components/ui/` | Buttons, forms, dialogs, etc. |
| **React Query** | `SparkyFitnessFrontend/src/hooks/queryClient.ts` `SparkyFitnessFrontend/src/hooks/queryKeys.ts` | TanStack Query setup, cache keys |
| **Mobile Health Sync** | `SparkyFitnessMobile/src/services/healthConnect*` `SparkyFitnessMobile/src/services/healthkit/` | Apple Health, Health Connect integration |

---

## How AI Tools Use This

```
Agent needs to fix medications bug:
  ↓
Greps "Medications" in this doc
  ↓
Finds: Backend = routes/v2/medicationRoutes.ts + services/medicationService.ts
         Frontend = pages/Medications/ + api/Medications/
         Mobile = screens/Medications*.tsx + services/api/medicationsApi.ts
  ↓
Opens exactly 3-4 files instead of scanning entire repo
  ↓
Saves ~5K tokens, finds bug in 1/10 the time
```
