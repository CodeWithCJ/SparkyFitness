# Garmin Connect microservice package (SparkyFitnessGarmin).

{
  lib,
  stdenvNoCC,
  python3,
  makeWrapper,
}:
let
  # Mirrors SparkyFitnessGarmin/requirements.txt.
  pythonEnv = python3.withPackages (ps: [
    ps.fastapi
    ps.uvicorn
    ps.garminconnect
    ps.curl-cffi
    ps.ua-generator
    ps.python-dotenv
  ]);
in
stdenvNoCC.mkDerivation {
  pname = "sparkyfitness-garmin";
  version = (lib.importJSON ../SparkyFitnessServer/package.json).version;

  src = lib.cleanSource ../SparkyFitnessGarmin;

  nativeBuildInputs = [
    makeWrapper
    pythonEnv
  ];

  dontBuild = true;

  doCheck = true;
  checkPhase = ''
    runHook preCheck
    python -m compileall -q main.py routes.py schemas.py service.py
    runHook postCheck
  '';

  installPhase = ''
    runHook preInstall

    appDir="$out/libexec/sparkyfitness-garmin"
    install -Dm644 -t "$appDir" main.py routes.py schemas.py service.py

    makeWrapper ${pythonEnv.interpreter} "$out/bin/sparkyfitness-garmin" \
      --add-flags "-m uvicorn" \
      --add-flags "main:app" \
      --prefix PYTHONPATH : "$appDir"

    runHook postInstall
  '';

  meta = {
    description = "SparkyFitness Garmin Connect microservice (FastAPI)";
    mainProgram = "sparkyfitness-garmin";
    platforms = lib.platforms.all;
  };
}
