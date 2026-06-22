# SparkyFitness on Nix / NixOS

This directory contains a Nix flake and a NixOS module for running SparkyFitness
**without Docker**.

## Layout

- [`../flake.nix`](../flake.nix) — packages, dev shell and NixOS modules.
- [`backend.nix`](./backend.nix) — the Express API server (`tsx index.ts`).
- [`frontend.nix`](./frontend.nix) — the static Vite build.
- [`module.nix`](./module.nix) — the `services.sparkyfitness` NixOS module
  (systemd backend service, optional local PostgreSQL, nginx reverse proxy).
- [`update-hashes.sh`](./update-hashes.sh) — recompute the pnpm dependency
  hashes after `pnpm-lock.yaml` changes.

## Building

```bash
nix build .#sparkyfitness-server
nix build .#sparkyfitness-frontend
```

> **Updating dependency hashes:** the `pnpmDeps.hash` values in `backend.nix`
> and `frontend.nix` pin the offline pnpm store and must be refreshed whenever
> `pnpm-lock.yaml` (or a package's dependency set) changes. A stale hash shows
> up as a `hash mismatch` build failure. Run the helper script to recompute
> both automatically:
>
> ```bash
> nix/update-hashes.sh
> # or, if nix is not on PATH:
> NIX=/path/to/nix nix/update-hashes.sh
> ```

## Dev shell

```bash
nix develop
# provides node 24, pnpm and postgresql
```

## NixOS deployment

```nix
{
  inputs.sparkyfitness.url = "github:CodeWithCJ/SparkyFitness";

  outputs = { nixpkgs, sparkyfitness, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        sparkyfitness.nixosModules.sparkyfitness
        {
          services.sparkyfitness = {
            enable = true;
            frontendUrl = "https://fitness.example.com";
            # Secrets (DB passwords, encryption key, auth secret) live here:
            environmentFile = "/run/secrets/sparkyfitness.env";
            nginx.virtualHost = "fitness.example.com";
          };
        }
      ];
    };
  };
}
```

Use `nixosModules.sparkyfitness` to get this flake's package builds wired in
automatically, or `nixosModules.default` and set `backendPackage` /
`frontendPackage` yourself.

### Required secrets (`environmentFile`)

The file is a systemd `EnvironmentFile` and should contain at least:

```
SPARKY_FITNESS_DB_PASSWORD=...
SPARKY_FITNESS_APP_DB_PASSWORD=...
SPARKY_FITNESS_API_ENCRYPTION_KEY=...   # openssl rand -hex 32
BETTER_AUTH_SECRET=...
```

When `database.createLocally = true` (the default), `SPARKY_FITNESS_DB_PASSWORD`
is also used to provision the local PostgreSQL owner role.
