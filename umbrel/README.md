# Umbrel App Store package

`sparkyfitness/` is a drop-in package for the [Umbrel App Store](https://github.com/getumbrel/umbrel-apps).
It is kept here so it versions alongside the code it deploys; Umbrel itself only
ever sees the copy submitted to `getumbrel/umbrel-apps`.

## Layout

```
sparkyfitness/
  umbrel-app.yml      # App Store manifest
  docker-compose.yml  # db + server + frontend, fronted by Umbrel's app_proxy
  exports.sh          # per-install secrets derived from the device seed
  data/               # bind-mount source dirs (.gitkeep removed at runtime)
```

## Packaging decisions

- **Port 3019.** Checked against every manifest `port` and published compose
  port in the App Store; SparkyFitness's usual `3004` is already taken.
- **Secrets are derived, never random.** `SPARKY_FITNESS_API_ENCRYPTION_KEY`
  decrypts provider credentials already in the database, and
  `BETTER_AUTH_SECRET` signs sessions and encrypts stored 2FA secrets. A value
  that changes between restarts logs everyone out and permanently locks out
  anyone with 2FA enabled, so `exports.sh` derives all four secrets from
  Umbrel's device seed with `derive_entropy`. The encryption key needs exactly
  64 hex characters, which is what `derive_entropy` returns.
- **Umbrel auth stays on for the UI, off for the API.** `PROXY_AUTH_WHITELIST`
  opens `/api`, `/health-data`, `/uploads` and `/mcp`, which are the only paths
  the mobile app, Health/Google Fit sync, and API-key clients use. None of them
  can carry an Umbrel auth cookie; Better Auth and the app's API-key checks
  guard those routes.
- **`ALLOW_PRIVATE_NETWORK_CORS: "true"`.** Umbrel is reached over plain HTTP
  and often by LAN IP rather than by `.local` name. This trusts private-network
  origins and drops the `Secure` cookie flag, without which sign-in fails on
  every non-HTTPS origin.
- **Trusted proxy hops left at the default of 1.** Umbrel's app gateway
  *overwrites* `X-Forwarded-For` with the client address and the frontend's
  nginx appends one hop, so stripping a single entry yields the real client IP.
- **Server runs as root.** `user: "1000:1000"` looks right here but breaks the
  app: multer's disk storage in `routes/backupRoutes.ts` creates `temp_uploads/`
  inside the image's own root-owned application directory at import time, so the
  server exits with `EACCES` before it ever listens. Verified by running it.
- **No `SPARKY_FITNESS_ADMIN_EMAIL`.** Migration
  `20260206132000_ensure_first_user_is_admin.sql` promotes the first registered
  account, so the admin panel is reachable without editing env on the device.

## The first submission

The initial App Store PR is manual, because `submission:` has to name a PR that
does not exist yet and the Umbrel team wants screenshots on it:

1. Copy `sparkyfitness/` to the root of a `getumbrel/umbrel-apps` checkout.
2. Open the PR, then set `submission:` to that PR's URL — it currently holds a
   placeholder — and attach screenshots and the logo to the PR body. Do not
   commit image assets; Umbrel hosts the final ones.
3. Validate:
   ```sh
   npm run lint:apps -- sparkyfitness --check-images
   git diff --check
   ```

`releaseNotes` is intentionally `""`, which is what Umbrel expects for a package
that has not shipped a store update yet. The automation fills it from then on.

## Staying current (automated)

After that, releases are handled by `.github/workflows/umbrel-app-update.yml`.
It runs once **Publish Docker Images** succeeds — the package pins digests, so it
cannot run before the images exist — and then:

1. Runs `update-package.mjs`, which re-pins all three images and rewrites
   `version` and `releaseNotes` from the GitHub release body.
2. Lints the result against a fresh `getumbrel/umbrel-apps` checkout.
3. Opens a PR here on `umbrel/update-app-package`.
4. Pushes to your `umbrel-apps` fork and opens the App Store PR, then backfills
   `submission:` with that PR's URL.

Steps 3 and 4 run unattended, so the gates in steps 1 and 2 are what stand in
for a reviewer:

- `update-package.mjs` refuses any tag that is not a multi-arch manifest list
  covering `linux/amd64` and `linux/arm64`, so a half-built release cannot be
  pinned.
- `npm run lint:apps -- sparkyfitness --check-images` must pass. Run against the
  full store, it also catches another app claiming host port 3019 before our PR
  would collide with it.

Either failure stops the job before anything reaches upstream.

### Setup required

| What | Why |
| --- | --- |
| `UMBREL_APPS_TOKEN` secret | A PAT with `public_repo` scope. Without it the upstream step is skipped with a warning and the in-repo PR still lands. |
| A fork of `getumbrel/umbrel-apps` | Created automatically on first run by `gh repo fork`. |
| `umbrel/` in `auto-merge-bot-prs.yml` | Optional. Lets the in-repo PR merge itself, like `i18n/` and `nix/` already do. |

`submitter:` in the manifest is whoever should be credited in the store. Change
it if submissions should not be attributed to the current value.

## Running it by hand

```sh
node umbrel/update-package.mjs                 # latest published release
node umbrel/update-package.mjs --version v1.7.2
node umbrel/update-package.mjs --no-postgres   # leave the database pin alone
```

It writes nothing when the package already matches, so it is safe to re-run.

The PostgreSQL pin is re-resolved against the **same** tag on every run, picking
up Alpine rebuilds without changing the PostgreSQL version. A major or minor
PostgreSQL bump is a data-migration event and stays a deliberate manual edit.
