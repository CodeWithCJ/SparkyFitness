# Frontend package: the statically built React/Vite bundle.
#
# Produces a directory of static assets ($out) that is served by nginx (see the
# NixOS module). The build resolves `@workspace/shared` from the monorepo, so
# the whole repo is used as source.
{
  lib,
  stdenv,
  nodejs,
  pnpm,
  fetchPnpmDeps,
  pnpmConfigHook,
}:
stdenv.mkDerivation (finalAttrs: {
  pname = "sparkyfitness-frontend";
  version = (lib.importJSON ../SparkyFitnessFrontend/package.json).version;

  src = lib.cleanSource ../.;

  pnpmWorkspaces = [
    "sparkyfitnessfrontend"
    "@workspace/shared"
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs)
      pname
      version
      src
      pnpmWorkspaces
      ;
    fetcherVersion = 3;
    hash = "sha256-l8C0UTYy7rPdLrC5etv3MfrRPXlnTw+3DIocWc2xg4k=";
  };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
  ];

  buildPhase = ''
    runHook preBuild
    # Invoke vite directly instead of the package `build` script, which also runs
    # the validate checks (those run in checkPhase below instead).
    pnpm --filter sparkyfitnessfrontend exec vite build
    runHook postBuild
  '';

  # Run the package's validate script (typecheck + lint + format:check) as the
  # check phase. Enabled by default; disable with `doCheck = false`.
  doCheck = true;
  checkPhase = ''
    runHook preCheck
    pnpm --filter sparkyfitnessfrontend run validate
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall
    cp -r SparkyFitnessFrontend/dist "$out"
    runHook postInstall
  '';

  meta = {
    description = "SparkyFitness web frontend (static build)";
    platforms = lib.platforms.all;
  };
})
