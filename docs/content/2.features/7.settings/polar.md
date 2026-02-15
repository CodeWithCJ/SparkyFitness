# Polar Flow Integration

The Polar integration allows you to sync workouts, physical measurements, and daily activity metrics from your Polar account directly to SparkyFitness.

---

## Setup Instructions

To connect Polar Flow, follow these steps:

1.  **Register as a Developer**: Visit the [Polar AccessLink Admin](https://admin.polaraccesslink.com/) portal and create a new client.
2.  **Configure Callback URL**: In the Polar Admin portal, set your **Callback URL** to:
    Directly get from External Providers page in SparkyFitness    
3.  **Enter Credentials**: In SparkyFitness Settings, navigate to **External Providers** and add a new "Polar" provider.
4.  **Enter Client ID and Client Secret**: Copy these from your Polar Admin dashboard into the SparkyFitness form.
5.  **Authorize**: Click "Connect" and you will be redirected to Polar to authorize the connection.

## Data Synchronized

SparkyFitness pulls the following data from Polar:

*   **Workouts (Exercises)**: Automatically logs cardio training sessions into your Diary, including duration, calories burned, and sport type.
*   **Physical Info**: Syncs your latest **Weight** and **Height** from your Polar profile.
*   **Daily Activity**: Syncs your daily **Steps**, **Active Calories**, and **Total Calories** as custom measurements.

## Important Limitations

> [!IMPORTANT]
> **Polar API Restrictions**:
> *   **No Historical Backfill**: Polar only allows access to data uploaded **after** you have authorized the SparkyFitness integration. Workouts recorded before you linked your account will not sync.
> *   **Manual Exercises**: Manually added exercises in Polar Flow may have limited support or availability depending on the Polar API version.

---

## Contributing Mock Data

We are constantly working to improve these integrations. If you notice data missing or incorrect, you can help by providing anonymized mock data.

Join the **CodeWithCJ** community on [Discord](https://discord.gg/vcnMT5cPEA) and reach out if you'd like to share your Polar mock data to help us improve the sync logic!
