# HUAWEI Health Integration

Yes—users can link HUAWEI Health while SparkyFitness is a web app. Linking uses
Huawei's cloud OAuth flow rather than Bluetooth or direct browser access to the
watch:

`Huawei wearable → HUAWEI Health phone app → Huawei cloud → SparkyFitness server → web app`

The exact product name shown in SparkyFitness is **HUAWEI Health**.

## What users need

- A Huawei ID with HUAWEI Health set up on a phone.
- A wearable or data source already syncing into the HUAWEI Health phone app.
- Their own SparkyFitness profile selected. Health integrations are owner-only
  and cannot be linked while acting on behalf of a family member.
- A SparkyFitness server whose administrator has configured and verified the
  Huawei integration.

## Link from the web app

1. Open **Settings → Food & Exercise Data Providers**.
2. Find the dedicated **HUAWEI Health** card.
3. Select **Connect account**.
4. Sign in on Huawei's authorization page and approve the data types you want
   to share.
5. Return to SparkyFitness and select **Sync now**.

Declining one optional data permission does not block the rest of the app.
SparkyFitness imports the data types that were approved and shows a
non-blocking partial-permissions notice for the rest.

## Data that can be imported

- Steps, calories burned, and distance.
- Heart-rate and resting-heart-rate summaries.
- Blood oxygen saturation (SpO2).
- Body weight.
- Sleep sessions and available sleep-stage summaries.
- Workout/activity records, including duration, distance, and calories when
  Huawei supplies them.

The first and default manual import covers the most recent seven local calendar
days. A manual request can cover up to 31 calendar days. SparkyFitness splits
API work into smaller timezone-safe chunks where required by Huawei.

## Manual and scheduled sync

- **Hosted Vercel deployment:** background jobs are disabled, so users must
  select **Sync now**. The card states this explicitly.
- **Self-hosted deployment with background jobs enabled:** connected providers
  are checked hourly at minute 15, with an overlapping seven-day window for
  replay safety.

Manual sync is processed synchronously so serverless deployments do not lose
work after returning a response.

## Privacy and disconnect behavior

- Access and refresh tokens are encrypted on the SparkyFitness server.
- The provider row, OAuth tokens, status, sync, and disconnect operations are
  strictly owner-only and are never shared through family-access permissions.
- SparkyFitness checks live Huawei consent on every sync and stops importing a
  data type after its permission is revoked.
- **Disconnect** first asks Huawei to cancel SparkyFitness authorization, then
  removes the locally stored tokens. It does not delete original data from
  Huawei.
- Previously imported SparkyFitness records remain subject to the server's
  retention policy and can be deleted from that server separately.

See the [SparkyFitness privacy policy](/privacy_policy) for the full hosted and
self-hosted data-handling description.

## Server administrator setup

Register a Web application in Huawei Developer Console, enable Health Service
Kit, request the needed read scopes, and configure:

```bash
SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_ID=...
SPARKY_FITNESS_HUAWEI_HEALTH_CLIENT_SECRET=...
# Optional; defaults to the client id
SPARKY_FITNESS_HUAWEI_HEALTH_APP_ID=...
# Optional; defaults to SPARKY_FITNESS_FRONTEND_URL + /huaweihealth/callback
SPARKY_FITNESS_HUAWEI_HEALTH_REDIRECT_URI=https://fitness.example.com/huaweihealth/callback
```

The redirect URI registered with Huawei must match exactly. Keep the client
secret server-side and retain a stable `SPARKY_FITNESS_API_ENCRYPTION_KEY`; a
key rotation needs a token migration or user reconnection plan.

The integration requests `openid`, one-week historical access, and read access
for steps, calories, distance, heart rate, oxygen saturation, height/weight,
sleep, and activity records. Huawei test access is limited to configured test
users until the required Health Service verification is approved. Allow time
for Huawei's review before advertising general availability.

Official references:

- [Huawei Health Service Kit](https://developer.huawei.com/consumer/en/hms/huaweihealth/)
- [Huawei OAuth authorization](https://developer.huawei.com/consumer/en/doc/development/HMSCore-Guides/open-platform-oauth-0000001053629189)
- [Huawei Health authorization](https://developer.huawei.com/consumer/cn/doc/HMSCore-Guides/auth-example-0000001054581058)
- [Huawei Health Service verification](https://developer.huawei.com/consumer/en/doc/HMSCore-Guides/verification-0000001211587947)

When credentials are absent, SparkyFitness keeps the card visible in a safe
disabled state and does not expose a broken authorization button.
