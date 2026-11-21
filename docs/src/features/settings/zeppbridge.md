# ZeppBridge (Amazfit / Zepp) Integration

The ZeppBridge integration brings Amazfit / Zepp sleep, workouts and daily metrics into SparkyFitness. SparkyFitness reads them from a [ZeppBridge](https://github.com/lingcang728/ZeppBridge) server that **you run yourself**, on your own machine or network.

**SparkyFitness never contacts Zepp and never sees your Zepp login.** It only pulls from your ZeppBridge, so your health data goes from your ZeppBridge to your SparkyFitness server and nowhere else.

::: warning Third-party integration: requires ZeppBridge
[ZeppBridge](https://github.com/lingcang728/ZeppBridge) is an independent open-source project. It is not made, maintained or supported by SparkyFitness, and this integration only works if you install and run it yourself. It signs in to your Zepp account and keeps a copy of your health data on your own machine, so please do your own due diligence before installing it: read its documentation and [privacy notes](https://github.com/lingcang728/ZeppBridge#privacy-and-connections), check what access it asks for, and decide whether you trust it. Use it at your own risk.

This integration is **experimental**. It was built from ZeppBridge's published API and has had limited testing with real devices. Which data you get depends on how you connect ZeppBridge to Zepp (see [Which data you get](#which-data-you-get)), and ZeppBridge's own documentation is the reference for installing and signing in.
:::

::: tip Simpler option for most people
If the Zepp app already writes to **Apple Health** (iPhone) or **Health Connect** (Android), the SparkyFitness mobile app can sync that data with no extra server. Use ZeppBridge when you want more detail than those stores hold, or when you do not use the mobile sync. Do not use both for the same data, or the same night or workout can appear twice.
:::

---

## How it fits together

```
Zepp cloud ──(ZeppBridge sync)──► ZeppBridge on your machine ──(serve, read-only)──► SparkyFitness
```

You set up two things on your side:

1. **ZeppBridge**, signed in to your Zepp account, syncing on a schedule.
2. **ZeppBridge `serve`**, a small read-only API with a **pull token**. This is what SparkyFitness connects to.

## Setup Instructions

### 1. Run ZeppBridge and its read-only API

Follow ZeppBridge's own guides: [Docker](https://github.com/lingcang728/ZeppBridge/blob/main/docs/guides/docker.md) and [self-hosted pull](https://github.com/lingcang728/ZeppBridge/blob/main/docs/guides/self-hosted-pull.md).

In short:

- Sign in once with the ZeppBridge **desktop app**. The Docker image cannot sign in by itself yet.
- Give the container the desktop app's data folder, and run `zeppbridge-cli sync` on a schedule (cron or a systemd timer).
- Run `zeppbridge-cli serve` and set `ZEPPBRIDGE_PULL_TOKEN` to a random value of at least 32 characters, for example `openssl rand -base64 33`. The pull token can only read data; it is separate from your Zepp login.

### 2. Make the two servers reachable

`serve` speaks plain HTTP, so keep it off the public internet. The simplest setup is one private Docker network shared by SparkyFitness and ZeppBridge. In your SparkyFitness `docker-compose` file, join the `sparkyfitness-server` service to ZeppBridge's internal network:

```yaml
services:
  sparkyfitness-server:
    networks:
      - sparkyfitness-network
      - zeppbridge-internal

networks:
  zeppbridge-internal:
    external: true
    name: <the network name from ZeppBridge's compose file>
```

The address to use is then `http://serve:43921` (the `serve` container's name and port). If ZeppBridge runs on another machine, put an HTTPS reverse proxy in front of it and use that `https://` address.

### 3. Connect in SparkyFitness

1. Go to **Settings → External Providers**.
2. Click **Add New Data Provider** and select **ZeppBridge (Amazfit / Zepp)**.
3. Enter the **ZeppBridge URL** (include `http://` or `https://`, for example `http://serve:43921`) and the **Pull token**.
4. Turn on **Activate this provider** and click **Add Provider**. SparkyFitness imports the last 30 days right away.
5. Use **Test connection** on the provider card to check the address and token at any time.
6. To sync automatically, edit the provider and set **Sync Frequency** to **Hourly** or **Daily**. Each scheduled sync re-reads the last 3 days, or everything since the last successful sync (up to 30 days) after a longer gap; use **Sync** on the card to import a longer range (up to 365 days at a time).

::: tip Private and LAN addresses
A ZeppBridge on your own network is a private address. Admin accounts can use one. On a server with several users, an admin first has to turn on **Allow Private / LAN Recipe Providers** in **Admin → Global Provider Settings** (this setting covers every self-hosted provider), or set `ALLOW_PRIVATE_NETWORK_FOOD_PROVIDERS=true` in the server environment. Without a scheme, SparkyFitness assumes `https://`, so type `http://` explicitly for a plain-HTTP address.
:::

---

## Data Synchronized

Re-syncing updates the same entries instead of adding new ones.

| ZeppBridge                                                                                                                             | SparkyFitness                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sleep sessions: start and end, score, deep, light, REM and awake time, wake count, sleep stages                                        | Sleep entries and sleep stages, dated by the day you woke up                                                                                                                                         |
| Workouts: type, start time, duration, distance, calories, average and max heart rate, cadence, stride length, elevation, training load | Exercise entries named after the activity (Running, Cycling, Strength Training and so on; an exercise with that name in your library is reused), one per workout, keyed by the ZeppBridge workout id |
| GPS route, per-second heart rate, cadence, power and altitude                                                                          | The workout's map and charts, with speed worked out from the route. Time in each heart rate zone is calculated from **your own** heart rate settings, not ZeppBridge's                               |
| Laps the watch marked                                                                                                                  | Workout laps (with a route, distance, pace and elevation are worked out from it)                                                                                                                     |
| Weight, body fat, muscle, bone and body water, steps                                                                                   | Check-in measurements                                                                                                                                                                                |
| Resting heart rate, VO2 max, distance, active calories, resting energy (BMR), lactate threshold, stress                                | Daily health summary                                                                                                                                                                                 |
| HRV, SpO2, respiration, stress and heart rate readings                                                                                 | Health metric samples (HRV, SpO2, respiration, stress, heart rate)                                                                                                                                   |

Not imported: food intake, calendar notes and strength-set detail ZeppBridge may hold.

A workout's route and detailed series are fetched once, the first time the workout is imported (or later, if that step failed), so they are not downloaded again on every sync. Delete the workout in SparkyFitness and sync that day again to fetch them anew.

## Which data you get

ZeppBridge marks every record with where it came from, and SparkyFitness imports all of them:

- **Official authorization** (Zepp Open Platform): a limited set of data types today.
- **Account connector** (ZeppBridge's optional extra login): more types, such as HRV, SpO2, all-day stress and readiness. This path uses Zepp's unofficial interface, so it can stop working when Zepp changes it, and ZeppBridge stores your Zepp account access for it. Decide whether that is acceptable for you; SparkyFitness does not need it.

Check ZeppBridge's documentation for the current list.

## Troubleshooting

- **"Could not connect to ZeppBridge":** check the URL includes `http://`, the `serve` container is running, and both containers share a network. On a multi-user server, see the private address note above.
- **"ZeppBridge rejected the pull token":** the token must match `ZEPPBRIDGE_PULL_TOKEN` exactly. After ten wrong attempts in a minute ZeppBridge blocks the address for ten minutes.
- **"Newer record format":** your ZeppBridge is newer than this SparkyFitness understands. Update SparkyFitness.
- **No new data:** ZeppBridge only serves what it has synced. Check that `zeppbridge-cli sync` is running on its schedule.
- **Wrong day for a night's sleep or a late workout:** check your timezone in SparkyFitness. Sleep and workout days use that setting; the ZeppBridge container's `TZ` does not change them. It still decides the day of daily metrics such as steps.

## Disconnecting

**Disconnect** on the provider card turns the integration off and keeps everything already imported. To remove imported data, use the synced-data delete tool in **Settings** for the source **ZeppBridge**. It removes the workouts, sleep, daily summaries and samples; weight, body composition and step check-ins are not removed by that tool.
