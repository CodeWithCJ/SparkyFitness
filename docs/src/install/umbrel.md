# Umbrel Installation Guide

SparkyFitness is packaged for [umbrelOS](https://umbrel.com/umbrelos) as an App
Store app. The package lives in this repository under
[`umbrel/sparkyfitness/`](https://github.com/CodeWithCJ/SparkyFitness/tree/main/umbrel/sparkyfitness)
and is submitted to the [Umbrel App Store](https://github.com/getumbrel/umbrel-apps).

## Install

Open the App Store on your Umbrel, search for **SparkyFitness**, and install it.
No configuration is required: Umbrel generates the database password, API
encryption key, and session secret for you and keeps them stable across
restarts, updates, and backups.

Once it starts, open the app and create an account. **The first account you
create becomes the administrator**, so make yours before sharing the app with
anyone else.

## What Umbrel manages for you

| Setting | Value on Umbrel |
| --- | --- |
| App URL | `http://umbrel.local:3019` (also reachable over `https://`) |
| Database | Bundled PostgreSQL 18, no setup needed |
| Secrets | Derived from the device seed; never regenerated |
| Data | `~/umbrel/app-data/sparkyfitness/data/` (database, uploads, backups) |
| Backups | Included in Umbrel's own backups |

Because secrets are derived from the device seed rather than generated at each
boot, sessions and stored two-factor secrets survive restarts and updates. See
[Environment Variables](/install/environment-variables) for what each of these
settings does.

## Access

The web UI sits behind your Umbrel login, so anyone already signed in to Umbrel
opens it without a second prompt.

`/api`, `/health-data` and `/mcp` are exempt from the Umbrel login, because the
SparkyFitness mobile app, Apple Health and Google Fit sync, and API-key clients
cannot send an Umbrel session cookie. Protected handlers on those paths still
require a SparkyFitness session or API key.

`/uploads` is exempt too, and it is **not** behind SparkyFitness authentication.
The server serves it as static files, so anyone who can reach your Umbrel on
port 3019 can fetch an upload whose URL they know. Check-in photos and pregnancy
uploads are the exception — those subtrees are blocked outright. This is how
SparkyFitness serves images on every deployment, not something the Umbrel
package changes, but the whitelist does mean your Umbrel login is not a second
gate in front of them.

### Connecting the mobile app

Use **`https://umbrel.local:3019`**, or `https://<your-Umbrel-LAN-IP>:3019`.

Release builds of the mobile app reject a plain-HTTP server, because HTTPS is
required to register passkeys, use the camera, and satisfy Apple Health and
Health Connect policy. umbrelOS serves every app port over both HTTP and TLS, so
the HTTPS URL works on the same port — but the certificate comes from Umbrel's
own local authority, so your phone will not trust it until you install and trust
that certificate.

## Limitations

- The Garmin integration service is not included in the Umbrel package yet.
- Email, OIDC single sign-on, and outbound proxy settings are not exposed as
  Umbrel install options. If you need them, use the
  [Docker Compose](/install/docker-compose) deployment instead.
