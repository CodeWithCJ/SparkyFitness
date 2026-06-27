# Backend package for the SparkyFitness Express server.
#
# The server has no compile step: `index.ts` is executed directly with `tsx`.
# We therefore install the (filtered) pnpm workspace, copy the resulting tree
# into the store and expose a small wrapper that runs `tsx index.ts` from the
# server directory (matching the Docker image).
{
  lib,
  stdenv,
  nodejs,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
  makeWrapper,
  postgresql,
  gnutar,
  gzip,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "sparkyfitness-server";
  version = (lib.importJSON ../SparkyFitnessServer/package.json).version;

  # The whole monorepo is the source: the server depends on the `@workspace/shared`
  # workspace package and resolves it through a relative symlink at runtime.
  src = lib.cleanSource ../.;

  # Only fetch / install the dependency closure required by the server (and the
  # shared workspace package it depends on).
  pnpmWorkspaces = [
    "sparkyfitnessserver"
    "@workspace/shared"
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src pnpmWorkspaces;
    fetcherVersion = 3;
    hash = "sha256-ERmN8UgypNf/q4TSZsYFLLBBwy2gXka+W0sgze6xn1o=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
    makeWrapper
  ];

  # No build step for the backend; it runs TypeScript directly through tsx.
  dontBuild = true;

  # Run the package's validate script (typecheck + lint + format:check) and the
  # vitest suite. The tests mock db/poolManager, so they need no live database
  # and run hermetically in the sandbox. Disable with `doCheck = false`.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    pnpm --filter sparkyfitnessserver run validate
    pnpm --filter sparkyfitnessserver test
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    appDir="$out/libexec/sparkyfitness"
    mkdir -p "$appDir"
    cp -r . "$appDir/"

    # Run the server exactly like the Docker image does: tsx executes the
    # TypeScript entrypoint directly, no separate build step.
    makeWrapper "$appDir/SparkyFitnessServer/node_modules/.bin/tsx" "$out/bin/sparkyfitness-server" \
      --chdir "$appDir/SparkyFitnessServer" \
      --add-flags "index.ts" \
      --prefix PATH : ${
        lib.makeBinPath [
          nodejs
          postgresql # pg_dump / psql used by the backup service
          gnutar
          gzip
        ]
      }

    runHook postInstall
  '';

  meta = {
    description = "SparkyFitness backend API server (Express + PostgreSQL)";
    mainProgram = "sparkyfitness-server";
    platforms = lib.platforms.linux;
  };
})
