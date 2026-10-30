# Family & Friends Sharing

Family & Friends Sharing in SparkyFitness allows you to connect with family members, friends, personal trainers, or coaches. By granting specific access permissions, you can allow others to log meals, track workouts, record check-ins, manage medications, track symptoms, or view progress reports on your behalf.

The system is built with **least-privilege boundary isolation** using PostgreSQL Row-Level Security (RLS), ensuring that your private credentials and account settings are never shared.

AI service model and reasoning settings remain private to their owner. An administrator can publish a shared configuration; family diary access does not grant access to personal AI credentials or settings.

---

## How to Set Up Sharing

Setting up a connection is simple and can be managed directly from the application settings:

1. **Go to Settings**: Navigate to `Settings` -> `Family Access Manager` in the application sidebar.
2. **Add a Connection**:
   - Enter the email address of the family member or friend you want to connect with.
   - Choose the specific permissions you want to grant them (see the matrix below).
   - *Optional:* Set an **Access End Date** if you want the permission to expire automatically.
3. **Save Connection**: Click **Add Connection**. The new connection will appear under "Rules I Created".
4. **Accessing Switched Profiles**: The connected person will now see your profile in their **Profile Switcher** (located in the top-right corner of the dashboard). They can select your name to switch contexts and act on your behalf.

---

## Copy Meals in the Mobile App

Open a meal in your diary and choose **Copy to family** to log a shared meal for someone else:

1. Choose a family member who has given you permission to copy into their diary.
2. Review the foods. Keep the whole meal selected or choose individual entries, and adjust the quantities for their portion.
3. Choose the destination date and meal. The available meal types belong to the recipient, including their custom meals.
4. Check the recipient and destination, then confirm. The app opens their diary on the chosen date so you can check the result.

Your original entries stay unchanged. Copying a complete meal without quantity changes preserves its grouping; selected or adjusted foods are saved as individual entries.

Copies to family add every reviewed food, even when the recipient already has the same food in that meal. Existing entries stay unchanged.

Copying requires the family member to grant you **Manage Diary** and **View Food Library**. Read-only or expired connections cannot receive copies. Permissions are checked again when you confirm, so removing access takes effect even if a review is already open. If the source foods have changed since you opened the review, refresh and review them again before copying.

To copy in the other direction, open **Family Diaries**, choose a member and a meal, then use **Copy to my diary**. Family access permissions are managed in the web app. If the app asks you to update the server when copying to family, update the server before retrying.

---

## Privilege Matrix by Permission Level

SparkyFitness uses 7 granular permissions to determine exactly what a connected user can read or write in your profile:

| Access Permission | Write (Create / Edit / Delete) Privileges | Read (View) Privileges |
| :--- | :--- | :--- |
| **Manage Diary**<br>`can_manage_diary` | ✍️ Food entries, exercise entries, running-shoe inventory, water logs, daily goal plans, favorite (starred) foods/meals (logged meals snapshot their serving size and yield at log time, so delegates and owners see the exact portion logged even if the master recipe changes). | 📖 Food entries, exercise entries, running-shoe inventory, water logs, daily goal plans, favorite (starred) foods/meals, custom food/exercise libraries, and read-only profile/layout/water-container settings.<br><br>❌ *Wellness logs (fasting, sleep, mood) and medication logs are completely blocked.* |
| **Manage Check-in**<br>`can_manage_checkin` | ✍️ Weight, body measurements, progress photos, mood logs, mindfulness & breathwork logs, fasting status, sleep logs, smart scale composition (muscle mass, bone mass, water %, BMR), lab results (HbA1c, cholesterol, etc., with reference ranges), and generic health telemetry (heart rate, HRV, respiration, SpO2, vitals, daily health scores, and captured wearable calorie totals). | 📖 Weight history, progress photos, wellness logs (mood, mindfulness, fasting, sleep), smart scale metrics, generic health telemetry, and read-only profile/layout settings.<br><br>❌ *Diary logs (food, exercise, water) and medication logs are completely blocked.* |
| **Manage Medications**<br>`can_manage_medications` | ✍️ Medication schedules, pen/vial allocations, injection records, and titration adjustments.<br><br>⚠️ *A supplement's nutrition-per-dose values are diary data — once doses are logged they change daily nutrition totals — so editing them additionally requires `can_manage_diary`. Without it the nutrient editor is hidden and the supplement saves without a nutrient payload; everything else about the supplement stays editable.* | 📖 Medication lists, schedules, logs, pens, injection sites, and titration steps.<br><br>❌ *Diary logs (food, exercise, water) and check-in logs (weight, sleep, fasting) are completely blocked.* |
| **Manage Symptoms**<br>`can_manage_symptoms` | ✍️ Symptom logs and episodes (severity, locations, triggers, treatments, photos), "no symptoms today" markers, and your symptom library (custom symptoms and pick-lists).<br><br>ℹ️ *Symptoms used to be part of Manage Medications. Everyone who already had Manage Medications was given Manage Symptoms when this permission was introduced, so nobody lost access.* | 📖 Symptom logs and episodes, treatments, photos, and your symptom library.<br><br>❌ *Menstrual-cycle and pregnancy symptoms are never shared, whatever permissions are granted. Diary, check-in and medication logs are blocked.* |
| **View Reports**<br>`can_view_reports` | ❌ **No write privileges** | 📖 All wellness, check-in, diary (including running-shoe inventory), medication, and symptom logs to display on charts, graphs, and the dashboard. Also includes read-only access to profile, dashboard layout, and onboarding data. |
| **View Food Library**<br>`can_view_food_library` | ❌ **No write privileges** | 📖 User's custom food list, recipes, and custom meals — including any reusable sub-meals a meal links as ingredients, and the freeform markdown **notes** saved on a food or meal — (isolated to when context is switched). Notes are read-only to delegates; only the owner can edit them.<br><br>❌ *Profile, dashboard layout, and onboarding data are **not** readable — this permission alone is insufficient.* |
| **View Exercise Library**<br>`can_view_exercise_library` | ❌ **No write privileges** | 📖 User's custom exercise database and workout presets (isolated to when context is switched).<br><br>❌ *Profile, dashboard layout, and onboarding data are **not** readable — this permission alone is insufficient.* |
| **Share Integrations**<br>`share_external_providers` | ❌ **No write privileges** (cannot add, edit, or delete provider configurations — owner-only). | 📖 Allows the family & friends to use the owner's non-private search provider configurations (e.g., FatSecret, USDA, OpenFoodFacts, Canadian Nutrient File, Swedish Food Agency) to search for food and exercise items and add them to their own library.<br><br>❌ *Shared personal provider credentials are never used for Open Food Facts contributions. Manual contributions require the server-wide administrator gate and the food owner acting as themselves. The owner must review one product and separately confirm the packaging data and rights to their own photo for that exact preview; this sharing permission grants neither consent. Preview and confirmation product reads share the server-wide safety budget.*<br><br>🧭 *A Valhalla routing provider (route generation and Follow roads) can be shared the same way, and an admin can make one public for everyone. Anyone using it sends their route points (start, end and waypoints) to that provider's server, and a shared API key is used on their behalf but never shown to them. Saved routes, segments and heatmaps stay owner-only; only the provider configuration is shared, never anyone's GPS data. Route generation itself is always for the signed-in person only.*<br><br>❌ *Health integrations (Garmin, Fitbit, Withings, Google Health, Polar, Strava, COROS, Hevy, Liftosaur, Intervals.icu) are strictly private and **never** shared — this permission does not grant access to them.* |

**Mood check-ins:** delegates with **Manage Check-in** or **View Reports** access see each of your mood check-ins for a day, including its journal text.

---

## Security & Boundary Isolation

### 1. Tier 1: Strictly Private Data
Certain tables contain private user data that is **never** accessible to any family member or friend, regardless of the permission level. This includes:
* API Keys (`api_key` table)
* OIDC SSO Connections (`user_oidc_links` table)
* Remote MCP OAuth clients, signing keys, consent grants, access/refresh tokens, and revocation records (`jwks` and `oauth_*` tables). These are system-managed and never exposed through family profile switching or delegation. The server-wide OAuth switch and redirect URI allowlist are administrator settings, not family-sharing permissions.
* Personal AI Assistant Chat History (`sparky_chat_history` table)
* Lasting food preferences, food task drafts and their operation history (`food_assistant_preferences`, `food_assistant_tasks`, `food_assistant_operations`). These belong to the signed-in person and are never delegated while viewing a family diary.
* Voice recordings are transient and are never shared or stored as diary entries. AI transcription uses only the signed-in user's accessible AI configuration, never credentials from a switched family profile.
* Personal Fasting Preferences and auto-calculation configuration (`user_fasting_preferences` table)
* Cycle & Pregnancy hub data (`cycle_settings`, `cycle_daily_entries`, `cycles`, `user_cycle_display_preferences`, `cycle_test_entries`, `pregnancies`, `pregnancy_kick_sessions`, `pregnancy_contractions`, `pregnancy_photos`, `pregnancy_checklist_state`, `health_appointments` tables) — this reproductive-health data is **never** shared or delegated, even with `can_view_reports`. It is strictly owner-only. Bump photo *files* are owner-only too: they are excluded from the public uploads URLs and can only be fetched through an authenticated request by their owner.
* Run program (`run_programs` table): your Beginner 5K program, your place in it, the days it shows in your Diary, its first day and your goal date, and any changes the AI assistant or you made to its workouts. A training plan is personal, so it is never shared or delegated.
* Running goals (`run_goals` table): your weekly running distance target and the race you are counting down to. Like the run program, they are personal and never shared or delegated.
* Your own run plans (`custom_run_programs` table): plans you wrote yourself, with their names and workouts. They are personal, so they are never shared or delegated.
* Running fitness tests (`fitness_tests` table): your 5K time trials, 30-minute runs and Cooper tests (outdoors or on a treadmill), their results and the training paces each one gave. They are personal training data, so they are never shared or delegated, and they are not available while you act on behalf of someone else.
* Your saved routes (`routes` table): routes you drew, imported or saved from a workout, with their points and turn cues. They are personal, so they are never shared or delegated.
* Your plates and bars (`plate_inventories` table): the bars you own and how many pairs of each plate, for the plate calculator. They are personal, so they are never shared or delegated, and the server refuses requests for them while you act on behalf of someone else. Someone logging workouts for you sees the calculator with the standard set for your weight unit.

### 2. Tier 2: Read-Only Profile & Settings Data
The following data can be **read** by delegates who hold at least one of `can_manage_diary`, `can_manage_checkin`, `can_manage_medications`, `can_manage_symptoms`, or `can_view_reports` — but **only the account owner can modify it**:
* Profile information (`profiles` table — name, date of birth, height, avatar, etc.)
* General preferences (`user_preferences` table — themes, units, calculation methods, the optional separate activity-calorie setting, calorie safety-floor settings, weekly weight-change goals, report chart scaling, heart rate zone settings (max and resting heart rate, zone method, custom zones — the Heart Rate Zones screen is also owner-only for family members), and Chat/Vision/Voice selections). Weekly weight-change goals sync across web and mobile and use the same owner-only editing rules as other calculation preferences; changing them does not grant family members additional access. Voice visibility, the System/AI selection, and the separate activity-calorie choice also sync across web and mobile. Only the owner can change them; disabling voice preserves the selected model.
* Nutrient column display preferences (`user_nutrient_display_preferences`)
* Calorie settings history (`user_calorie_rule_history` — the goal mode, activity level, BMR and other calorie settings in force from each change on, so past days keep the calorie target they were logged against). It is recorded automatically when the owner changes those settings; family members can see it alongside the preferences, but cannot change it.
* Dashboard widget layout (`user_dashboard_layouts`)
* Onboarding data and completion status (`onboarding_data`, `onboarding_status`)

Delegates with only library permissions **cannot** read or write any of the above.

### 3. Workout Feedback (Pain & Difficulty)
After a workout you can say how it felt (too easy / just right / too hard) and flag pain or discomfort with a note. Adaptive suggestions learn from this. This feedback (`workout_feedback` table) is shared like the rest of your diary: delegates with **Manage Diary** (`can_manage_diary`) can see and record it for you, and delegates with **View Reports** (`can_view_reports`) can see it. Pain notes are health information, so keep that in mind when choosing who gets these permissions.

### 4. Context-Switched Library Isolation
Your custom food library, recipes, custom exercises, and medication inventory are only visible to delegates when they have switched their active profile context to your profile. This prevents their personal libraries/cabinets from being cluttered with your items.

### 5. Automatic Token Validation & Expiry
If you set an **Access End Date** for a connection, the database automatically revokes all database read/write access the moment that timestamp passes. No manual action is needed.

### 6. Deleting a Shared Food or Exercise

A diary entry keeps its own copy of everything it needs to display itself — the food's name, brand and full nutrition, or the exercise's name, category, muscles, equipment and images. It does not depend on the library item it was logged from, so removing that item never erases anyone's history.

When you delete a food or exercise from your library you are offered up to three choices:

| Choice | Your library | Your meals & meal plans (food)<br>Your presets & plans (exercise) | Your diary | **Anyone else's data** |
| :--- | :--- | :--- | :--- | :--- |
| **Hide** | Stops appearing in search | Unchanged, keeps working | Unchanged | **Unchanged** |
| **Delete** | Removed | Removed | **Kept** | **Unchanged** |
| **Delete including history** | Removed | Removed | **Also deleted** | **Unchanged** |

**Another person's diary is never affected by your delete**, in any of the three modes. "Delete including history" removes only *your* logged entries; a family member who logged the same item keeps theirs in full.

If someone else still uses the item — they have logged it, or it sits in their meals, meal plans, presets or workout plans — **Hide is the only option offered**. Meals, meal plans, presets and workout plans are linked to the library item itself rather than snapshotted, so genuinely deleting it would silently strip the item out of their templates too. Hiding removes it from search for everyone from that point on while leaving all existing history and templates intact.

### 7. Meal-to-Meal Composition
A meal's ingredient list can link another reusable meal (e.g. a sauce or side) instead of a plain food. Linking a sub-meal into a parent meal requires the same library access to the sub-meal that reading it directly would require — you cannot link a sub-meal you cannot otherwise view. This check applies independently of, and in addition to, owning the parent meal.
