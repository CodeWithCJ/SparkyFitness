# User Settings

The Settings page is organized into four tabs. Each tab contains collapsible sections: expand the ones you need.

## Profile & Account

- **Profile Information**: profile photo, full name, phone number, date of birth, gender, height, and bio
- **Preferences**: units (weight, measurement, distance, energy in kcal or kJ), date and time formats, chart scale mode, target bedtime, timezone, the minimum logging level, and the estimated blood alcohol settings (distribution formula, elimination rate, and display unit; see [Estimated Blood Alcohol](/features/diary/blood-alcohol)). See [Preferences](/features/settings/preferences)
- **Features**: turn whole features on or off. The mobile app has the same screen under **Settings → Features**. Turning a feature off only hides it: nothing is deleted, and syncs and imports keep running. Only the account owner can change these
  - **Cycle tracking**: one switch for the website and the mobile app. The first time you turn it on, it asks a few questions to set it up. Turned off, it also leaves the check-in, reports and symptom lists on the website and in the app: the reproductive data Apple Health and Health Connect sync, the symptoms logged in the Cycle tab or Cycle Hub, and the cycle column of the website's symptoms CSV. In the app, the Dashboard card and the + menu row are left out too
  - **Medications**: on by default, with a separate switch on the website and in the app. It covers supplements, GLP-1 tracking, injections, adherence and the medication log. Turned off on the website, the Medications tab and its Add menu entry leave, and so do the Medications report, the medication layer of the glucose chart, the medication pickers of the symptom form, the prenatal supplements on the pregnancy vitals card and the Medications chip of the chat's tool selector; opening the page or the report by its address offers to turn it back on. Turned off in the app, the Library row, the Dashboard card, the button on its What's New card, the medication layer of the glucose chart and the medication reminder settings leave, and medication reminders stop. They come back when you turn it on again, with your reminder settings as they were; while the app cannot tell whether it is on (for example when it opens offline), reminders stay as they are. Signing in again, or switching to another account or server, cancels them until the app can read that account's choice. Where it is turned off, the GLP-1 daily check-in answers (hunger, food noise, fullness and energy) also leave the check-in, the Diary and Reports. Supplement nutrients still count in your totals, the AI assistant can still log and read your medications, and the watch's Medications page is unchanged for now. Someone acting for you on the website sees Medications as their permissions allow
  - **Lab results**: on by default, with a separate switch on the website and in the app. Turned off on the website, the Lab results tab and its Add menu entry leave, and opening the page by its address offers to turn them back on; turned off in the app, the Library row, the Dashboard card and the button on its What's New card leave
  - The settings that arrange a feature's tab, card or + menu item (Tabs on the website, Dashboard and Quick Actions settings in the app) leave it out while the feature is off and say "Some features are turned off", with **Manage** to open Features; a tile it was on shows empty. They keep its place, switch and tile for when the feature comes back. The app's Notifications settings and the website chat's tool selector show the same line in place of Medications
- **Tabs**: choose which main tabs show on the website (Check-In, Medications, Lab results, Reports, Foods, Exercises, Goals). A hidden tab also leaves the + menu and the Diary links that only lead to it. Nothing is deleted, and opening the page by its address still works. Diary and Settings always show, and Cycle is turned on or off in Features. A tab whose feature is off in Features is left out here, with one "Some features are turned off · Manage" line, and comes back as you left it. The mobile app has its own dashboard, quick action and watch page settings
- **Family Access**: manage family and friend invitations and their permissions ([Family & Friends Sharing](/features/family-friends-sharing))
- **Data Import**: bring in a food database or food diary from CSV
- **Data Export**: download all of your data as CSV (comma or semicolon separator) ([Sharing](/features/sharing))
- **Account Security**: update your email, change your password, manage passkeys, and set up multi-factor authentication. See [Login Management](/features/settings/login-management)


## Nutrition & Diet

- **Allergen Preferences**: mark allergens so they're flagged in your foods
- **Custom Nutrients**: define your own nutrients (for example: *alcohol units*, *creatine*) that you can track on foods and set goals for
- **Nutrient Display**: choose which nutrients appear in each part of the app, and in what order. See [Nutrient Display](/features/settings/nutrient-display-settings)
- **Nutrient Goal Direction**: for each nutrient, whether your goal is a target, a maximum, or a minimum
- **Custom Meals**: manage your meal types (e.g., Breakfast, Lunch) used across the diary and meal plans
- **Calculation Settings**: goal mode, TDEE calculation method, and adaptive goal settings. See [Calculation Settings](/features/settings/calculation-settings)
- **Water Tracking**: water display unit (ml, oz, liters), whether exercise water counts toward your goal and food water counts toward your intake, plus the **Manage Water Containers** and quick-add drink presets. See [Water Intake](/features/diary/water-intake)
- **Intermittent Fasting**: your default fasting protocol (or custom hours), target fasting and eating hours, the calorie threshold that can end a fast, the pre-goal warning, and fasting alerts


## Wellness

- **Cycle & Pregnancy**: cycle tracking and pregnancy-mode configuration; the full feature lives in the [Cycle Hub](/features/cycle-hub/). Cycle is turned on or off in Features, and the rest of its settings show once cycle is on and set up
- **Guided Workouts**: enable guided mode and pick the voice for coached workout playback ([Guided Workouts](/features/exercises/guided-workouts))
- **Custom Categories**: create the extra measurement categories (numeric or text, with their own units) that appear on the [Measurements](/features/measurements) tab of Check-In


## Developer & Integrations

- **Food & Exercise Data Providers**: connect food databases (Open Food Facts, USDA, FatSecret, Mealie, Tandoor, YAZIO, Norish, Swiss Food Database, [Canadian Nutrient File](/features/settings/canadian-nutrient-file)), exercise providers, and wearable platforms. See [External Providers](/features/settings/external-providers)
- **AI Service**: choose which AI service powers the app's AI features, including photo-based food recognition
- **API Key Management**: create and manage API keys with expiry and full or read-only access ([Sharing](/features/sharing))
- **Developer Resources**: links for developers, including the API and [MCP Server](/features/mcp-server)


## Related pages

- [Preferences](/features/settings/preferences)
- [Calculation Settings](/features/settings/calculation-settings)
- [External Providers](/features/settings/external-providers)
- [Nutrient Display](/features/settings/nutrient-display-settings)
- [Login Management](/features/settings/login-management)
- [Sharing](/features/sharing)
