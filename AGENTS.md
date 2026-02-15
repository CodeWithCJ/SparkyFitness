# SparkyFitness Project Documentation

## 1. Project Overview
SparkyFitness is a comprehensive health and fitness tracking application that combines nutrition, exercise, sleep, and wellness monitoring. It features a modern web frontend, a robust backend API, and a mobile application.

## 2. Directory Structure
- **Root**: `c:\SparkyApps\SparkyFitness`
- **Frontend**: `SparkyFitnessFrontend` (Vite + React)
- **Backend**: `SparkyFitnessServer` (Node.js + Express)
- **Mobile**: `SparkyFitnessMobile` (React Native + Expo)
- **Database**: PostgreSQL (Schema definitions in `db_schema_backup.sql` in root, migrations in `SparkyFitnessServer/db/migrations`)
- **Documentation**: `docs/` folder contains additional project documentation.

## 3. Technology Stack

### Frontend (Web)
- **Core**: React 18, TypeScript, Vite
- **UI/Styling**: Tailwind CSS, Shadcn/UI (@radix-ui/*), Lucide React
- **State Management**: React Query, React Context, React Hook Form + Zod
- **Routing**: React Router DOM v6
- **Utils**: date-fns, moment, axios, i18next
- **Integrations**: Leaflet, Recharts, HTML5-QRCode
- **PWA**: vite-plugin-pwa
*(See Section 8 for detailed Frontend Architecture)*

### Backend (API)
- **Runtime**: Node.js
- **Framework**: Express v5
- **Database**: PostgreSQL (via `pg` driver)
- **Authentication**: 
    - JWT (Cookies)
    - bcrypt
    - Connect-PG-Simple (Session store)
    - OIDC Support (OpenID Client)
    - MFA (TOTP, Email, Recovery Codes)
- **External Services**: Supabase (Client), Garmin Connect, OpenID Client
- **Utilities**: Node-Cron (Scheduling), Multer (File uploads), Nodemailer, UUID, Speakeasy (2FA)

### Mobile (App)
- **Framework**: React Native 0.81, Expo 54
- **Navigation**: React Navigation 7
- **Health Integration**: Expo Health Connect, React Native Health Connect (Google Health Connect)
- **Storage**: Async Storage
- **Architecture**:
    - **Single Screen Interface**: Initial version focuses on configuration and sync.
    - **Data Flow**:
        1.  User configures server URL and API Key.
        2.  App requests permissions for health data (e.g., Steps) via Health Connect.
        3.  User initiates sync for a selected range (24h, 3d, 7d).
        4.  App aggregates data by date and sends it to the backend (`POST /health-data`).
    - **State Management**: `AsyncStorage` persists user preferences (server URL, API key, sync settings).

## 4. Database Schema
The database uses PostgreSQL. The root file `db_schema_backup.sql` contains the reference schema.

### Database Tables (Comprehensive List)

#### Identity, Access & User Settings
- `auth.users`: Core identity (Supabase/Auth pattern).
- `public.profiles`: Extended profile (name, gender, bio, avatar).
- `public.user_preferences`: Global settings (units, themes, algorithms).
- `public.user_api_keys`: Personal API keys for external access.
- `public.family_access`: Data sharing permissions.
- `public.oidc_providers` & `user_oidc_links`: SSO configuration.
- `public.onboarding_status` & `onboarding_data`: User setup state.
- `public.session`: Connect-PG-Simple session store.
- `public.admin_activity_logs`: Audit logs for admin actions.

#### Nutrition & Diet
- **Library**: `foods`, `food_variants`, `meals` (recipes), `meal_foods`, `user_custom_nutrients`.
- **Logging**: `food_entries`, `food_entry_meals` (grouped entries), `water_intake`, `fasting_logs`.
- **Planning**: `meal_plans`, `meal_plan_templates`, `meal_plan_template_assignments`.
- **Config**: `user_nutrient_display_preferences`, `user_water_containers`.

#### Goals & Progress
- **Goals**: `user_goals` (daily macros/micros), `goal_presets`,  `weekly_goal_plans`. 

#### Fitness & Activity
- **Library**: `exercises`, `workout_presets`, `workout_preset_exercises`, `workout_preset_exercise_sets`.
- **Logging**: `exercise_entries`, `exercise_entry_sets`, `exercise_entry_activity_details`, `exercise_preset_entries`.
- **Planning**: `workout_plan_templates`, `workout_plan_template_assignments`, `workout_plan_assignment_sets`.

#### Health & Wellness
- **Metrics**: `check_in_measurements` (weight, body fat), `custom_measurements`, `custom_categories`.
- **Sleep**: `sleep_entries`, `sleep_entry_stages`.
- **Mood**: `mood_entries`.

#### System & Integrations
- `public.ai_service_settings`: Configuration for LLM features.
- `public.external_data_providers`: Config for Garmin, Strava, etc.
- `public.sparky_chat_history`: Storage for AI chat context.
- `public.backup_settings`: User data backup configs.
- `public.user_ignored_updates`: Update skipping logic.
- `system.schema_migrations`: Migration tracking.

### Key Database Concepts
- **Primary Keys**: Mostly **UUIDs**, but some legacy or specific tables may use **Integer** (Serial) keys. Always check the specific table definition.
- **JSONB**: Extensively used for flexible data (`access_permissions`, `custom_nutrients`, `visible_nutrients`, `details`).
- **RLS (Row Level Security)**: 
    - Single source of truth is `SparkyFitnessServer/db/rls_policies.sql`.
    - **CRITICAL**: This file MUST be updated whenever new tables are added.
    - It is executed on server startup to apply policies.
- **Migrations**: 
    - Located in `SparkyFitnessServer/db/migrations`.
    - **Naming Convention**: `YYYYMMDDHHMMSS_description.sql` (New timestamp mandatory for new files).
- **Functions**: Heavy use of PL/pgSQL functions for business logic.

## 5. Development & Deployment
- **Docker**:
    - Directory: `docker/` contains Dockerfiles (`Dockerfile.frontend`, `Dockerfile.backend`, `Dockerfile.garmin_microservice`).
    - Configs: `docker-compose.dev.yml` and `docker-compose.prod.yml`.
- **GitHub Workflows** (`.github/workflows`):
    - `android.yml`: Builds Android APK/AAB.
    - `docker-deploy.yml`: Automated Docker build & push on release.
    - `manual-docker-deploy.yml`: Manual trigger for Docker image creation.
- **CI Checks**:
    - Before committing, the following checks must pass for the frontend:
    - `npm run lint` (ESLint)
    - `npx prettier . --check` (Code formatting)
- **Scripts**:
    - `docker-entrypoint.sh` & `docker-helper.sh` facilitate container startup.
    - **Proxy Configuration**:
        - **Local Development**: `Vite Proxy` is used (configured in `vite.config.ts`) to forward `/api`, `/api/withings`, and `/health-data` to the backend running on localhost.
        - **Production (Docker)**: `Nginx` (configured in `docker/nginx.conf`) acts as the internal reverse proxy. It handles:
            - Serving static React assets.
            - Rate limiting for auth endpoints (`/api/auth/login`, `/api/auth/register`).
            - Proxying API requests to the backend container (handling rewrite rules where necessary).
            - Proxying `health-data`, `uploads`, and `openid` routes.
- **Proxmox Deployment**:
    - **Script**: `proxmox_sparkyfitness.sh` automates deployment in a Proxmox LXC container. 
    - **Features**:
        - Creates a new LXC with Docker and Docker Compose pre-installed.
        - Sets up the environment variables and database connection.
        - Deploys the application using `docker-compose.yml`.
        - this is commmunity provided. so untested

## 6. Business Logic & Domain Rules
### Authentication & Security
- **JWT**: Tokens are signed with `JWT_SECRET` and stored in a secure, HTTP-only cookie named `token`.
- **MFA**: Support for both TOTP (Google Authenticator) and Email OTP. 
- **RBAC**: Middleware (`checkPermissionMiddleware`) enforces granular permissions (e.g., `'diary'`, `'reports'`).
- **Magic Links**: Supported via email.

### AI & Chat Services
- **Service**: `SparkyFitnessServer/services/chatService.js` handles AI interactions.
- **Providers**: Supports OpenAI, Anthropic (Claude), Google (Gemini), Mistral, Groq, and Ollama (local).
- **Features**:
    - **Chat**: General conversation and health advice.
    - **Logging**: Parses natural language to log food, exercise, measurements, and water.
    - **Image Analysis**: Uses multimodal models (e.g., Gemini, GPT-4o) to analyze food images and estimate nutrition.
    - **Food Options Generation**: Generates realistic food options with estimated nutrition based on user requests (e.g., "GENERATE_FOOD_OPTIONS:apple in piece").
- **Configuration**: Users can configure different AI providers and models via `public.ai_service_settings`.

### Nutrition
- **Unit Conversion**: Frontend `PreferencesContext` handles `kg/lbs`, `cm/inches`, and `kcal/kJ` conversions.
- **Calculations**: BMR, Body Fat, and customized nutrient goals are calculated based on user-selected algorithms (Mifflin-St Jeor, etc.).
- **Data providers**: Custom abstraction for external food APIs (OpenFoodFacts, etc.).

### Data Synchronization
- **Garmin**: Separate microservice logic handles pulling data.
- **Mobile Sync**: Likely relies on `BackgroundFetch` in React Native to pull/push health data.

## 7. API Patterns & Conventions
- **Base URL**: `/api` (Backend usually mapped via proxy in dev).
- **Versioning**: Endpoints like `/api/version/current`.
- **Error Handling**: JSON responses with `{ error: "Message" }`. HTTP 4xx for client errors, 5xx for server errors.
- **Success Handling**: JSON responses, often returning the created/updated object directly or wrapped in a message.
- **Endpoints**: Pluralized nouns (e.g., `/food-entries`, `/goals`). hierarchical for related data (e.g., `/food-entries/copy`).

## 8. Frontend Architecture

### Core Technology
- **Framework**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Shadcn/UI (@radix-ui/*), Lucide React
- **Routing**: React Router DOM v6
- **State Management**: TanStack Query (Server State via hooks in `src/hooks/` and API definitions in `src/api/`), React Context (Global State), React Hook Form + Zod (Forms).

### Global State Management (Context API)
The application relies heavily on React Context for global state, wrapped in `App.tsx`:
- `AuthContext`: Manages user authentication state and session.
- `ActiveUserContext`: Handles permission checks (`hasPermission`) and "acting on behalf of" logic for family/admin features.
- `PreferencesContext`: Handles user preferences (units, display limits, algorithms). Syncs with backend.
- `ThemeContext`: Manages UI theming (Light/Dark).
- `ChatbotVisibilityContext`: Controls the visibility of the AI assistant.
- `WaterContainerContext`: Manages water tracking container presets.
- `FastingContext`: Scoped provider for fasting features (wrapped around `/fasting` route).

### Routing & Navigation
Routes are defined in `AppContent.tsx` and protected via `useAuth` and `useActiveUser` hooks.
- **Public Routes**: `/login`, `/forgot-password`, `/reset-password`, `/login/magic-link`.
- **Protected Routes**:
    - `/`: Main dashboard (`Index`).
    - `/fasting`: Dedicated fasting page.
    - `/settings/integrations`: External provider settings.
    - `/admin/*`: Admin routes (`AuthenticationSettings`, `UserManagement`).
- **Conditional Routes** (Permission-based):
    - `/meals`: Meal Management (Requires 'diary' permission).
    - `/meal-plan`: Meal Plan Calendar (Requires 'diary' permission).
    - `/reports/mood`: Mood Reports (Requires 'reports' permission).

### Layouts
The `src/layouts/` directory contains reusable page structures and layout components.

### Component Structure & Domains
The application is organized into functional domains, often corresponding to main navigation tabs:

- **Diary** (`FoodDiary`):
    - **Purpose**: Daily nutrition tracking.
    - **Components**: `DiaryTopControls`, `MealBuilder`, `DailyProgress`.

- **Check-In** (`CheckIn`):
    - **Purpose**: Health metric logging and Fasting management.
    - **Components**: `BodyMeasurements`, `FastingTimer` (via `FastingProvider`).

- **Reports** (`Reports`):
    - **Purpose**: Data visualization and analytics.
    - **Components**: `ZoomableChart`, `SleepEntrySection`, `StressChart`, `MoodReports`.

- **Foods** (`FoodDatabaseManager`):
    - **Purpose**: Manage the food library.
    - **Components**: `FoodSearch`, `CustomFoodForm`, `MealManagement` (Route: `/meals`), `MealPlanCalendar` (Route: `/meal-plan`).

- **Exercises** (`ExerciseDatabaseManager`):
    - **Purpose**: Manage the workout library.
    - **Components**: `ExerciseSearch`, `WorkoutPresetsManager`, `WorkoutPlansManager`.

- **Goals** (`GoalsSettings`):
    - **Purpose**: Configure nutritional and activity targets.
    - **Components**: `EditGoals`, `WeeklyGoalPlanService`.

- **Settings** (`Settings`):
    - **Purpose**: User and App configuration.
    - **Components**: `ExternalProviderSettings`, `AIServiceSettings`, `WaterContainerManager`.

- **Admin** (`Admin`):
    - **Purpose**: System administration.
    - **Pages**: `AuthenticationSettings`, `UserManagement`, `BackupSettings`.

### Service Layer
Located in `src/services/`, these file-based services wrap `apiCall` (axios) for backend communication.
- **Examples**: `foodEntryService.ts`, `authService.ts`, `reportsService.ts`.

## 9. Environment Variables (Template)
See `.env.example` in root for full list. Key variables:
- `SPARKY_FITNESS_DB_*`: Database connection details.
- `SPARKY_FITNESS_SERVER_PORT`: Backend port (Default: 3010).
- `jwt_secret`, `encryption_key`: Security secrets.
- `SPARKY_FITNESS_ADMIN_EMAIL`: Admin configuration.
