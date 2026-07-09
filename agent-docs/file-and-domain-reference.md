# File & Domain Reference Map

Quick navigation guide for finding code by feature. Most feature areas span backend, frontend, mobile, and shared — but **naming is not uniform and some layers are absent per domain**. Treat the tables below as starting points, then grep the feature name to confirm the real files.

---

## Domain Layout (approximate, not a strict template)

A typical feature touches roughly these areas. Real names vary (`measurementService`, not `checkInService`; `mealRoutes.ts` at top level, not under `v2/`), and some domains have no service, no shared schema, or no mobile screen at all.

```
Backend  (SparkyFitnessServer/)
  routes/<domain>Routes.ts  OR  routes/v2/<domain>Routes.ts   → endpoints (v2 is a subset)
  schemas/<domain>Schemas.ts                                  → Zod for v2 routes
  services/<domain>Service.ts                                 → business logic (NOT every domain has one)
  models/<domain>Repository.ts  OR  models/<domain>.ts        → DB queries (naming is mixed)
  tests/<domain>*.test.ts                                     → route/service/repo tests

Frontend (SparkyFitnessFrontend/src/)
  pages/<Domain>/   api/<Domain>/   hooks/<Domain>/ (folder) or hooks/use<Domain>.ts (flat)

Mobile   (SparkyFitnessMobile/src/)
  screens/<Domain>*.tsx (flat)   services/api/<domain>Api.ts   hooks/use<Domain>.ts (flat)

Shared   (shared/src/)
  schemas/database/<Table>.zod.ts   schemas/api/<Name>.api.zod.ts   constants/  medications/  cycle/  ...
```

---

## Feature Domains

Paths are relative to each package root. `—` means that layer does not exist for the domain.

### Food & Nutrition

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Foods** | `routes/foodRoutes.ts` `routes/foodCrudRoutes.ts` `routes/v2/foodRoutes.ts`, `services/foodService.ts` `services/foodCoreService.ts`, `models/food.ts` `models/foodRepository.ts` | `pages/Foods/` `api/Foods/` `hooks/Foods/` | `screens/Food*Screen.tsx` `services/api/foodsApi.ts` `hooks/useFoods.ts` | `schemas/database/Foods.zod.ts` (no Foods API schema) |
| **Meals** | `routes/mealRoutes.ts` `routes/mealTypeRoutes.ts`, `services/mealService.ts`, `models/mealRepository.ts` | folded into `pages/Foods/` + `pages/Diary/` (no `pages/Meals/`) | `screens/Meal*Screen.tsx` `services/api/mealsApi.ts` `hooks/useMeals.ts` | `schemas/database/Meals.zod.ts` `schemas/database/MealFoods.zod.ts` |
| **Food Entries** | `routes/foodEntryRoutes.ts` `routes/foodEntryMealRoutes.ts`, `services/foodEntryService.ts`, `models/foodEntry.ts` `models/foodEntryMealRepository.ts` | `pages/Diary/` `api/Diary/` | `services/api/foodEntriesApi.ts` `services/api/foodEntryMealsApi.ts` | `schemas/database/FoodEntries.zod.ts` `schemas/api/FoodEntries.api.zod.ts` |

### Exercise & Workouts

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Exercises** | `routes/exerciseRoutes.ts` `routes/v2/exerciseRoutes.ts`, `services/exerciseService.ts`, `models/exercise.ts` `models/exerciseRepository.ts` | `pages/Exercises/` `api/Exercises/` `hooks/Exercises/` | `screens/Exercise*Screen.tsx` `services/api/exerciseApi.ts` | `schemas/database/Exercises.zod.ts` `schemas/api/Exercises.api.zod.ts` |
| **Workouts** (presets/plans) | `routes/workoutPresetRoutes.ts` `routes/workoutPlanTemplateRoutes.ts`, `services/workoutPresetService.ts` `services/workoutPlanTemplateService.ts`, `models/workoutPresetRepository.ts` `models/workoutPlanTemplateRepository.ts` | `pages/Exercises/` | `screens/Workout*Screen.tsx` `services/api/workoutPresetsApi.ts` | `schemas/database/ExercisePresetEntries.zod.ts` (no `Workout*.zod.ts`) |
| **Exercise Entries** | `routes/exerciseEntryRoutes.ts` `routes/v2/exerciseEntryRoutes.ts` `routes/exercisePresetEntryRoutes.ts`, `services/exerciseEntryService.ts`, `models/exerciseEntry.ts` | `pages/Diary/` `api/Exercises/` | `services/api/exerciseApi.ts` | `schemas/database/ExerciseEntries.zod.ts` `schemas/api/ExerciseEntries.api.zod.ts` |

### Measurements & Health

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Check-In** (weight, measurements) | `routes/measurementRoutes.ts`, `services/measurementService.ts`, `models/measurementRepository.ts` | `pages/CheckIn/` `api/CheckIn/` `hooks/CheckIn/` | `screens/MeasurementsAddScreen.tsx` `services/api/measurementsApi.ts` `hooks/useMeasurements.ts` | `schemas/database/CheckInMeasurements.zod.ts` `schemas/api/CheckInMeasurements.api.zod.ts` |
| **Water Intake** | `routes/waterContainerRoutes.ts` `routes/v2/waterIntakeRoutes.ts`, `services/waterContainerService.ts`, `models/waterContainerRepository.ts` | `pages/Diary/` (water) `api/Diary/waterIntakteService.ts` *(sic — real filename)* | `hooks/useWaterIntakeMutation.ts` | — |
| **Custom Measurements / Nutrients** | `routes/customNutrientRoutes.ts`, `services/customNutrientService.ts` | `pages/CheckIn/` `api/CheckIn/` | `services/api/customNutrientsApi.ts` `hooks/useCustomNutrients.ts` | `schemas/database/CustomMeasurements.zod.ts` `schemas/database/CustomCategories.zod.ts` `schemas/api/CustomMeasurements.api.zod.ts` |

### Sleep, Fasting, Mood, Medications

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Sleep** | `routes/sleepRoutes.ts` `routes/sleepScienceRoutes.ts`, `services/sleepAnalyticsService.ts` `services/sleepScienceService.ts`, `models/sleepRepository.ts` `models/sleepScienceRepository.ts` | `api/SleepScience/` `hooks/SleepScience/` (surfaced in Reports; no dedicated page) | `services/api/healthDataApi.ts` | `schemas/database/SleepEntries.zod.ts` `schemas/database/SleepEntryStages.zod.ts` `schemas/database/DailySleepNeed.zod.ts` `schemas/api/SleepScience.api.zod.ts` |
| **Fasting** | `routes/fastingRoutes.ts` (logic in route — no service), `models/fastingRepository.ts` | `pages/Fasting/` `api/Fasting/` `hooks/Fasting/` | `screens/FastingDetailScreen.tsx` `services/api/fastingApi.ts` `hooks/useFasting.ts` | `schemas/database/FastingLogs.zod.ts` |
| **Mood** | `routes/moodRoutes.ts` (no service), `models/moodRepository.ts` | `pages/CheckIn/` (mood) `api/CheckIn/` | — | `schemas/database/MoodEntries.zod.ts` |
| **Medications** (+ symptoms) | `routes/v2/medicationRoutes.ts` `routes/v2/symptomRoutes.ts`, `schemas/medicationSchemas.ts` `schemas/symptomSchemas.ts`, `models/medicationRepository.ts` `models/medicationEntryRepository.ts` `models/medicationPenRepository.ts` `models/injectionRepository.ts` `models/titrationRepository.ts` `models/symptomRepository.ts` (`services/glp1Service.ts`) | `pages/Medications/` `api/Medications/` `hooks/useMedications.ts` `hooks/useSymptoms.ts` (flat) | — (not implemented on mobile) | `shared/src/medications/` (`schedules.ts` `correlations.ts` `symptoms.ts` `glp1.ts`) — no `schemas/database/Medication*.zod.ts` |

### Cycle & Pregnancy (owner-only — no delegation)

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Cycle** | `routes/v2/cycleRoutes.ts`, `schemas/cycleSchemas.ts`, `services/cycleService.ts`, `models/cycleRepository.ts` | `pages/Cycle/` `api/Cycle/` `hooks/useCycle.ts` (flat) | — | tables `cycles`, `cycle_daily_entries`, `cycle_settings` (no `Cycle*.zod.ts`) |
| **Pregnancy** | `routes/v2/pregnancyRoutes.ts`, `schemas/pregnancySchemas.ts`, `services/pregnancyService.ts`, `models/pregnancyRepository.ts` | `api/Pregnancy/` `hooks/usePregnancy.ts` (no page) | — | (no `Pregnancy*.zod.ts`) |

### Reporting & Analytics

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Daily Summary** | `routes/dailySummaryRoutes.ts`, `services/dailySummaryService.ts` `services/DashboardService.ts` (no dedicated repository) | `pages/Reports/` `api/Diary/dailySummaryService.ts` | `screens/DashboardScreen.tsx` `services/api/dailySummaryApi.ts` `hooks/useDailySummary.ts` | `schemas/api/DailySummary.api.zod.ts` |
| **Goals** | `routes/goalRoutes.ts` `routes/goalPresetRoutes.ts` `routes/v2/goalPresetRoutes.ts`, `services/goalService.ts` `services/goalPresetService.ts`, `models/goalRepository.ts` `models/goalPresetRepository.ts` | `pages/Goals/` `api/Goals/` `hooks/Goals/` | `services/api/goalsApi.ts` | `schemas/database/GoalPresets.zod.ts` `schemas/api/DailyGoals.api.zod.ts` |
| **Reports** | `routes/reportRoutes.ts`, `services/reportService.ts`, `models/reportRepository.ts` | `pages/Reports/` `api/Reports/` `hooks/Reports/` | dashboard + detail screens | — |

### Auth, Settings, Admin

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Auth** (login, MFA, passkeys) | `routes/authRoutes.ts` `routes/auth/` `auth.ts`, `services/authService.ts` | `pages/Auth/` `api/Auth/` `hooks/useAuth.tsx` | `screens/OnboardingScreen.tsx` `screens/ServerSettingsScreen.tsx` `services/api/authService.ts` `hooks/useAuth.ts` | `schemas/database/Account.zod.ts` `schemas/database/Session.zod.ts` `schemas/database/Passkey.zod.ts` |
| **Profile & Preferences** | `routes/preferenceRoutes.ts`, `services/preferenceService.ts`, `models/preferenceRepository.ts` `models/userRepository.ts` | `pages/Settings/` `api/Settings/` `hooks/Settings/` | `screens/*SettingsScreen.tsx` (flat) `services/api/profileApi.ts` `services/api/preferencesApi.ts` `hooks/useProfile.ts` `hooks/usePreferences.ts` | `schemas/database/Profiles.zod.ts` |
| **Admin** (global settings, logs) | `routes/adminRoutes.ts` `routes/adminAuthRoutes.ts` `routes/globalSettingsRoutes.ts` (no `adminService`), `models/adminActivityLogRepository.ts` `models/globalSettingsRepository.ts` | `pages/Admin/` `api/Admin/` `hooks/Admin/` | — | `schemas/database/AdminActivityLogs.zod.ts` `schemas/database/GlobalSettings.zod.ts` |
| **Integrations** (providers, API keys) | `routes/externalProviderRoutes.ts` + per-provider routes (`fitbitRoutes.ts` `garminRoutes.ts` `stravaRoutes.ts` `withingsRoutes.ts` `polarRoutes.ts` `googleHealthRoutes.ts`), `services/externalProviderService.ts`, `integrations/` | `pages/Integrations/` `api/Integrations/` `hooks/Integrations/` | `services/api/externalProvidersApi.ts` | `schemas/database/ExternalDataProviders.zod.ts` `schemas/database/ExternalProviderTypes.zod.ts` |

### AI & Chat

| Feature | Backend | Frontend | Mobile | Shared |
|---------|---------|----------|--------|--------|
| **Chat** (Sparky) | `routes/chatRoutes.ts` `routes/mcpRoutes.ts`, `services/chatService.ts`, `ai/tools/` | `pages/Chat/` `api/Chatbot/` `hooks/AI/` | `screens/ChatScreen.tsx` `services/api/chatApi.ts` `hooks/useChatHistory.ts` | — (no Chat API schema) |
| **AI Photo Estimate** | `routes/checkInPhotoRoutes.ts` + food-photo route, `services/foodPhotoEstimationService.ts` `services/checkInPhotoService.ts`, `ai/` | `pages/Foods/` (photo flow) | `screens/FoodPhoto*Screen.tsx` `services/api/externalFoodSearchApi.ts` `hooks/useEstimateFoodPhoto.ts` | `schemas/api/FoodPhotoEstimate.api.zod.ts` |

---

## Finding Code: Quick Search

1. Find the feature row above and note the package folders.
2. **Grep the feature name** inside those folders to land on the exact file — the tables point at the right neighborhood, not always the exact filename.
3. Check "Shared" for the schema/contract; note some domains keep schemas outside `schemas/database/` (e.g. medications under `shared/src/medications/`).

**Example: bug in the fasting timer**
- Backend: `routes/fastingRoutes.ts`, `models/fastingRepository.ts` (no fasting service)
- Mobile: `screens/FastingDetailScreen.tsx`, `services/api/fastingApi.ts`, `hooks/useFasting.ts`
- Shared: `schemas/database/FastingLogs.zod.ts`

---

## Cross-Cutting Code (Not Domain-Specific)

| System | Location | Purpose |
|--------|----------|---------|
| **Database & RLS** | `SparkyFitnessServer/db/` | Migrations, `rls_policies.sql`, pool management |
| **Auth Framework** | `SparkyFitnessServer/auth.ts` `SparkyFitnessServer/middleware/authMiddleware.ts` | Better Auth config, session handling |
| **Permissions** | `SparkyFitnessServer/middleware/checkPermissionMiddleware.ts` `SparkyFitnessServer/utils/permissionUtils.ts` | Family access, delegation logic |
| **Shared Schemas** | `shared/src/schemas/` | Database tables, API contracts (plus domain modules under `shared/src/medications/`, `shared/src/cycle/`, etc.) |
| **Timezone Helpers** | `shared/src/utils/` `SparkyFitnessServer/utils/timezoneLoader.ts` | Day strings, UTC conversions |
| **UI Primitives** | `SparkyFitnessFrontend/src/components/ui/` | Buttons, forms, dialogs, etc. |
| **React Query (frontend)** | client configured inline in `SparkyFitnessFrontend/src/main.tsx`; keys in `SparkyFitnessFrontend/src/api/keys/*.ts` | TanStack Query setup, cache keys |
| **React Query (mobile)** | `SparkyFitnessMobile/src/hooks/queryClient.ts` `SparkyFitnessMobile/src/hooks/queryKeys.ts` | TanStack Query setup, cache keys |
| **Mobile Health Sync** | `SparkyFitnessMobile/src/services/` (Health Connect / HealthKit modules) | Apple Health, Health Connect integration |

---

## How AI Tools Use This

Grep the feature name in this doc to narrow to the right package folders, then grep the same name inside those folders to open the actual files. The naming is intentionally **not** uniform, so confirm against the filesystem rather than assuming a `<feature>Service.ts` / `<feature>Repository.ts` file exists.
