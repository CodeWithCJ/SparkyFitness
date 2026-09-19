# Google Health Integration

The Google Health integration allows you to sync fitness metrics, sleep data, and health measurements from your Google Health account directly to SparkyFitness. It is the recommended replacement for Fitbit after the Fitbit Web API is deprecated in September 2026.

---

## Prerequisites

- A Google account with a compatible wearable (Fitbit, Wear OS, or any device that syncs to Google Health Connect)
- A Google Cloud project (free tier is sufficient)

---

## Setup Instructions

### 1. Create a Google Cloud project

Go to the [Google Cloud Console](https://console.cloud.google.com), create a new project (or select an existing one).

### 2. Enable the Google Health API

Navigate to **APIs & Services → Library**, search for **Google Health API**, and click **Enable**.

### 3. Configure the OAuth consent screen

Go to **APIs & Services → OAuth consent screen**:

- **User Type**: External
- Fill in the app name, support email, and developer contact
- **Add scopes** — click "Add or remove scopes" and add all six scopes listed below
- Under **Test users**, add your own Google account
- **Publish the app** (click "Publish App") — this is required to prevent Google from revoking refresh tokens after 7 days. It is safe to publish without Google verification for personal use; you will see an "unverified app" warning when connecting, which you can dismiss.

### 4. Create OAuth 2.0 credentials

Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**:

- **Application type**: Web application
- **Authorized redirect URIs**: paste the Callback URL shown in SparkyFitness (**Settings → External Data Sources → Google Health → edit icon → Callback URL**)

Save and copy the **Client ID** and **Client Secret**.

### 5. Connect in SparkyFitness

1. Go to **Settings → External Data Sources** and find the **Google Health** entry
2. Click the edit icon and paste in your **Client ID** and **Client Secret**
3. Click **Save**, then click **Connect**
4. Complete the Google OAuth consent flow — accept the "unverified app" warning if prompted

---

## Required Scopes

Add all six of these scopes to your OAuth consent screen:

```
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
https://www.googleapis.com/auth/googlehealth.location.readonly
https://www.googleapis.com/auth/googlehealth.profile.readonly
https://www.googleapis.com/auth/googlehealth.settings.readonly
```

---

## Data Synchronized

SparkyFitness pulls the following data from Google Health:

- **Activity**: Steps, Active Zone Minutes (fat burn / cardio / peak), Activity Minutes (sedentary / lightly / moderately / very active), Distance, Floors
- **Health metrics**: Resting heart rate, Heart rate variability (HRV), Blood oxygen (SpO2), Respiratory rate, Skin temperature variation, Body fat percentage, VO2 Max, Daily calories, Weight
- **Sleep**: Sleep sessions with stage breakdown (light, deep, REM, awake)
- **Exercise**: Workouts logged in Google Health, including duration and calories

---

## Important Limitations

> [!IMPORTANT]
> **Google Health API Restrictions**:
>
> - **Sleep history depth**: The Google Health API limits session-based data (sleep, exercises) to approximately 30 days per query. SparkyFitness automatically splits wide date ranges into 30-day chunks to work around this, so a 365-day import will succeed — it just takes a little longer.
> - **Device-specific metrics**: Some metrics (hydration, core temperature) require a device that explicitly writes them to Health Connect. Fitbit Versa 4 does not record these; a Pixel Watch or similar device is needed.
> - **Token refresh**: Access tokens expire after 1 hour and are refreshed automatically. If you encounter authentication errors after editing your credentials, use **Disconnect** then **Connect** again — editing credentials alone does not re-authorize the connection.
> - **App publication required**: If you skip publishing the OAuth app, Google will revoke your refresh token after 7 days, causing the integration to stop syncing.

---

## Contributing Mock Data

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by providing anonymized mock data.

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share your Google Health mock data to help improve the sync logic!
