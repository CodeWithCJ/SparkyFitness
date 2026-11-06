# Umbrel App Store package

`sparkyfitness/` is a drop-in package for the [Umbrel App Store](https://github.com/getumbrel/umbrel-apps).
It is kept here so it versions alongside the code it deploys; Umbrel itself only
ever sees the copy submitted to `getumbrel/umbrel-apps`.

## Layout

```
sparkyfitness/
  umbrel-app.yml      # App Store manifest
  docker-compose.yml  # db + server + frontend + garmin, fronted by Umbrel's app_proxy
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
- **Umbrel auth is off (`PROXY_AUTH_ADD: "false"`).** SparkyFitness has its own
  account system and Umbrel's login is single-owner: a partner or family member
  signing in with their own SparkyFitness account still hits Umbrel's
  device-password gate first, which they either share or get locked out of.
  Turning Umbrel auth off for the whole app hands access control to
  SparkyFitness's own login and 2FA instead of layering the two. There is no
  `PROXY_AUTH_WHITELIST` for the same reason — nothing is left to whitelist
  around once the outer gate is gone.
- **The HTTPS origin is trusted as well as the HTTP one.** umbrelOS serves each
  app port over both HTTP and TLS, and release builds of the mobile app refuse a
  plain-HTTP server. `ALLOW_PRIVATE_NETWORK_CORS` does not cover the HTTPS
  origin, because that check only recognises IP literals and localhost, never a
  `.local` name — so the HTTPS origin is passed explicitly in
  `SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS`, alongside the Tor origin when one
  exists.
- **The Tor origin is computed in `exports.sh`, not inline in Compose.**
  `APP_HIDDEN_SERVICE` is never actually empty — umbrelOS fills it with a
  placeholder such as `not-enabled.onion` before a real hidden service exists —
  so a Compose `${VAR:+...}` guard can't tell a placeholder from a real
  address and would trust `http://not-enabled.onion` on every install. Only
  bash can make that comparison, so `exports.sh` exports
  `APP_SPARKYFITNESS_TOR_ORIGIN` as empty unless a real hidden service exists.
- **`ALLOW_PRIVATE_NETWORK_CORS: "true"`.** Umbrel is reached over plain HTTP
  and often by LAN IP rather than by `.local` name. This trusts private-network
  origins and drops the `Secure` cookie flag, without which sign-in fails on
  every non-HTTPS origin.
- **`SPARKY_FITNESS_TRUSTED_PROXY_HOPS: "2"`, not the default of 1.** Two
  proxies sit in front of the server: `app_proxy` overwrites `X-Forwarded-For`
  with the client address, then the frontend's nginx appends its own upstream
  address (`$remote_addr`, i.e. `app_proxy`'s container IP) on top of that.
  Stripping only one hop leaves `req.ip` on `app_proxy` for every visitor,
  which puts the whole household in one sign-in rate-limit bucket and one
  audit-log identity.
- **`NGINX_RATE_LIMIT: 20r/s` on the frontend, not the default 5r/s.** The
  frontend's login rate limiter keys on `$binary_remote_addr`, nginx's raw TCP
  peer address — which, behind `app_proxy`, is *always* `app_proxy`'s container
  IP, for every visitor, regardless of the trusted-proxy-hops setting above
  (that setting only affects the Node server's `req.ip`, not nginx's own
  limiter). The default budget is sized for one user, not a household sharing
  one apparent address.
- **`SPARKY_FITNESS_CUSTOM_TEMP_DIRECTORY` points at a bind mount, and the
  server runs as `1000:1000`.** Without it, multer's disk storage in
  `routes/backupRoutes.ts` creates `temp_uploads/` inside the image's own
  root-owned application directory at import time, and `user: "1000:1000"`
  makes the server exit with `EACCES` before it ever listens. Redirecting that
  directory to a bind mount this uid owns — the same fix upstream uses for
  non-root deployments — lets the server run unprivileged. Verified by running
  it as `1000:1000` with the mount in place. The bind mount is `data/upload-tmp/`,
  not `data/tmp/`: the App Store repo's own `.gitignore` has a blanket `tmp/`
  rule that would silently drop the committed `.gitkeep`, so nothing would
  exist for umbrelOS to mount on a fresh install.
- **Garmin sync is bundled as a `garmin` sidecar.** Umbrel users have no way to
  add a container of their own, so leaving it out would mean Garmin Connect
  sync is simply unavailable on this platform. It is stateless — no bind mount,
  and its two env vars (`GARMIN_SERVICE_PORT`, `GARMIN_SERVICE_IS_CN`) both
  default sanely when unset. China-region Garmin accounts are not supported
  here, since `GARMIN_SERVICE_IS_CN` isn't exposed as an install option.
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

Two workflows split the release-to-package-to-store path, so that merging the
in-repo PR is a real human review gate rather than a formality the automation
walks straight past:

**`umbrel-app-update.yml`** runs once **Publish Docker Images** succeeds for an
actual `release` event — the package pins digests, so it cannot run before the
images exist, and a manual re-run of that workflow (which rebuilds the current
branch under the latest tag, not a new release) is excluded. It then:

1. Runs `update-package.mjs`, which re-pins all four images and rewrites
   `version` and `releaseNotes` from the GitHub release body.
2. Lints the result against a fresh `getumbrel/umbrel-apps` checkout, in a
   separate, tokenless job — the App Store's own `npm install` and lint
   scripts never run in a job that can write to this repository.
3. Opens a PR here on `umbrel/update-app-package`.

**`umbrel-app-submit.yml`** runs only on a push to `main` that touches
`umbrel/sparkyfitness/**` — that is, only once a maintainer has reviewed and
merged the PR from step 3. It then pushes the same version/releaseNotes/image
change to your `umbrel-apps` fork and opens or updates the App Store PR.

Submission patches the upstream package **in place** with the same
`update-package.mjs` script (`--target` pointed at the cloned upstream copy),
rather than replacing the whole directory. That means anything the Umbrel team
has added since the initial merge — gallery images, an icon, a category
change — survives every later update; only `version`, `releaseNotes`, and the
pinned image lines change. It is also why this workflow is a no-op until the
initial submission (see above) has actually been merged upstream: there is
nothing to patch in place before then.

The gates that stand in for a human reviewer on the two automated PRs:

- `update-package.mjs` refuses any tag that is not a multi-arch manifest list
  covering `linux/amd64` and `linux/arm64`, so a half-built release cannot be
  pinned.
- `npm run lint:apps -- sparkyfitness --check-images` must pass. Run against the
  full store, it also catches another app claiming host port 3019 before our PR
  would collide with it.

Either failure stops the corresponding job before anything reaches upstream.

### Setup required

| What | Why |
| --- | --- |
| `UMBREL_APPS_TOKEN` secret in the `release` environment | A PAT with `public_repo` scope. The submit job runs in the `release` environment and waits for a maintainer's approval. Delete any repository-level copy: a workflow pushed on any branch can read repository secrets. Without it the submit workflow's step is skipped with a warning; the in-repo PR still lands regardless. |
| A fork of `getumbrel/umbrel-apps` | Created automatically on first run by `gh repo fork`, with a short poll for the fork to become available before pushing to it. |
| Auto-merge for `umbrel/` | Optional, and left out deliberately, since merging that PR is the review gate before the store submission. It would take `umbrel/` in `ALLOWED_BRANCH_PREFIXES` and the job `if` of `auto-merge-bot-prs.yml`, and an `umbrel/` allowlist in `.github/scripts/automation-allowlist.cjs`. |

`submitter:` in the manifest is whoever should be credited in the store, and
`submission:` — once set to the real PR URL after the initial manual
submission — is left untouched by every later automated update.

## Running it by hand

```sh
node umbrel/update-package.mjs                             # latest published release
node umbrel/update-package.mjs --version v1.7.2
node umbrel/update-package.mjs --no-postgres                # leave the database pin alone
node umbrel/update-package.mjs --target /path/to/other/pkg   # patch a different package directory
```

It writes nothing when the package already matches, so it is safe to re-run.

The PostgreSQL pin is re-resolved against the **same** tag on every run, picking
up Alpine rebuilds without changing the PostgreSQL version. A major or minor
PostgreSQL bump is a data-migration event and stays a deliberate manual edit.
