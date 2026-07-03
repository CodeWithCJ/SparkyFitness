@echo off
setlocal enabledelayedexpansion
cd SparkyFitnessGarmin

rem Initialize variables to empty strings
set "GARMIN_SERVICE_PORT="
set "SPARKY_FITNESS_GARMIN_DATA_SOURCE="

for /f "tokens=1* delims==" %%a in (..\.env) do (
    if "%%a"=="GARMIN_SERVICE_PORT" set "GARMIN_SERVICE_PORT=%%b"
    if "%%a"=="SPARKY_FITNESS_GARMIN_DATA_SOURCE" set "SPARKY_FITNESS_GARMIN_DATA_SOURCE=%%b"
)
 
call venv\Scripts\activate.bat

rem Set the environment variable for the current process before launching uvicorn
rem The variable is already set by the for loop, but this ensures it's available to the Python process
set "SPARKY_FITNESS_GARMIN_DATA_SOURCE=%SPARKY_FITNESS_GARMIN_DATA_SOURCE%"

python -m uvicorn main:app --host 0.0.0.0 --port %GARMIN_SERVICE_PORT% --reload
pause
endlocal