# SparkyFitness Zepp Auth

Cloudflare Worker behind `https://zepp-auth.sparkyfitness.com`. It will become the
OAuth relay for the Zepp (Amazfit) integration ([#301](https://github.com/CodeWithCJ/SparkyFitness/issues/301)).
Zepp issues one shared client ID to SparkyFitness, and its token exchange needs
the client secret, which self-hosted servers must not hold. The relay keeps the
secret. Each user's own server calls `api-open.zepp.com` directly with its own
tokens, so health data never passes through the relay.

## Current stage: registration only

Zepp checks that both callback URLs respond when it registers the app:

| URL                        | Bare `GET` / `HEAD`       | Anything else                                                       |
| -------------------------- | ------------------------- | ------------------------------------------------------------------- |
| `/api/zepp/oauth/callback` | `200` `registration_only` | Query string: `503`; other methods: `405`                           |
| `/api/zepp/data/callback`  | `200` `registration_only` | `POST` or query string: `503` (body not read); other methods: `405` |

Every other path returns `404`. No secrets, storage or bindings yet.

## Deploy

`sparkyfitness.com` must be a zone in the same Cloudflare account. The
`custom_domain` route creates the DNS record and certificate on deploy.

```bash
cd SparkyFitnessZeppAuth
npx wrangler@4 login     # once
npx wrangler@4 deploy
curl -i https://zepp-auth.sparkyfitness.com/api/zepp/oauth/callback
```

Not a `pnpm` workspace package, and kept separate from `SparkyFitnessTag/`,
which must stay free of secrets.
