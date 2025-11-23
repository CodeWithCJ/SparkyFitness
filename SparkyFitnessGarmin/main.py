import logging
import uuid
import time
import os
import json # Import the json module
from datetime import date, timedelta, datetime # Import date and timedelta
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from urllib.parse import urlencode, parse_qs
from pydantic import BaseModel
import uvicorn
from garminconnect import Garmin
from garth.exc import GarthHTTPError, GarthException
import pytz
import json
import os # Ensure os is imported for path operations
from dotenv import load_dotenv # Import load_dotenv

load_dotenv() # Load environment variables from .env file

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

MOCK_DATA_DIR = "mock_data"

# Ensure the mock_data directory exists at startup
os.makedirs(MOCK_DATA_DIR, exist_ok=True)

def _save_to_local_file(filename: str, data: dict):
    """Saves data to a local JSON file within the mock_data directory."""
    os.makedirs(MOCK_DATA_DIR, exist_ok=True)
    filepath = os.path.join(MOCK_DATA_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(data, f, indent=4)
    logger.info(f"Data saved to local file: {filepath}")

def _load_from_local_file(filename: str) -> dict | None:
    """Loads data from a local JSON file within the mock_data directory."""
    filepath = os.path.join(MOCK_DATA_DIR, filename)
    if os.path.exists(filepath):
        with open(filepath, "r") as f:
            data = json.load(f)
        logger.info(f"Data loaded from local file: {filepath}")
        return data
    logger.warning(f"Local file not found: {filepath}")
    return None

app = FastAPI()

# Get port from environment variable or use default
PORT = int(os.getenv("GARMIN_SERVICE_PORT", 8000))
IS_CN = bool(os.getenv("GARMIN_SERVICE_IS_CN", "false").lower() == "true")
GARMIN_DATA_SOURCE = os.getenv("GARMIN_DATA_SOURCE", "garmin").lower() # "garmin" or "local"

logger.info(f"Garmin service configured to run on port: {PORT}")
if IS_CN:
    logger.info("Configured for Garmin China (CN) region.")
logger.info(f"Garmin data source configured to: {GARMIN_DATA_SOURCE}")

# Define a Pydantic model for login credentials

MFA_STATE_STORE: dict[str, object] = {}
MFA_TTL_SECONDS = 5 * 60  # 5 minutes

def _cleanup_mfa_cache():
    now = time.time()
    to_delete = [
        token for token, v in MFA_STATE_STORE.items()
        if now - v["ts"] > MFA_TTL_SECONDS
    ]
    for t in to_delete:
        MFA_STATE_STORE.pop(t, None)


def get_dates_in_range(start_date_str, end_date_str):
    start_date = date.fromisoformat(start_date_str)
    end_date = date.fromisoformat(end_date_str)
    delta = timedelta(days=1)
    dates = []
    current_date = start_date
    while current_date <= end_date:
        dates.append(current_date.isoformat())
        current_date += delta
    return dates

def clean_garmin_data(data):
    """
    Recursively remove fields that are None, 0, or specific Garmin internal IDs.
    Also, attempt to parse strings that are valid JSON.
    """
    if isinstance(data, dict):
        cleaned_dict = {}
        for k, v in data.items():
            if v is not None and v != 0 and k not in ['ownerId', 'userProfilePk', 'permissionId', 'userRoles', 'equipmentTypeId'] and 'endConditionCompare' not in k:
                cleaned_value = clean_garmin_data(v)
                if cleaned_value is not None and cleaned_value != 0:
                    cleaned_dict[k] = cleaned_value
        return cleaned_dict if cleaned_dict else None
    elif isinstance(data, list):
        cleaned_list = [clean_garmin_data(item) for item in data]
        return [item for item in cleaned_list if item is not None and item != 0]
    elif isinstance(data, str):
        # Attempt to parse string as JSON, handling non-standard escapes
        try:
            parsed_json = json.loads(data.replace('""', '"'))
            # If successfully parsed, recursively clean the parsed object
            return clean_garmin_data(parsed_json)
        except json.JSONDecodeError:
            # If not valid JSON, return the original string
            return data
    return data

def safe_convert(value, conversion_func):
    """Safely apply a conversion function to a value, returning None if the value is None."""
    return conversion_func(value) if value is not None else None

def grams_to_kg(g):
    """Convert grams to kilograms."""
    return g / 1000.0

def meters_to_km(m):
    """Convert meters to kilometers."""
    return m / 1000.0

def seconds_to_minutes(s):
    """Convert seconds to minutes."""
    return s / 60.0

def convert_activities_units(activities):
    """Convert units for a list of activities."""
    for activity in activities:
        activity['distance'] = safe_convert(activity.get('distance'), meters_to_km)
        activity['duration'] = safe_convert(activity.get('duration'), seconds_to_minutes)
        activity['elapsedDuration'] = safe_convert(activity.get('elapsedDuration'), seconds_to_minutes)
        activity['movingDuration'] = safe_convert(activity.get('movingDuration'), seconds_to_minutes)
        # Add other activity-level conversions here if needed
    return activities

def convert_user_summary_units(summary):
    """Convert units for the user summary."""
    if summary and 'totalWeight' in summary:
        summary['totalWeight'] = safe_convert(summary.get('totalWeight'), grams_to_kg)
    # Add other summary-level conversions here if needed
    return summary

def map_garmin_stress_to_mood(stress_level):
    """
    Maps Garmin stress level (0-100) to SparkyFitness mood value (0-100).
    -1, -2 indicate no data.
    """
    if stress_level is None or stress_level < 0:
        return None, None # No mood if no valid stress data

    if 0 <= stress_level <= 10:
        return 95, "Excited" # 91-100
    elif 11 <= stress_level <= 25:
        return 85, "Happy" # 81-90
    elif 26 <= stress_level <= 35:
        return 75, "Confident" # 71-80
    elif 36 <= stress_level <= 50:
        return 65, "Calm" # 61-70
    elif 51 <= stress_level <= 60:
        return 55, "Thoughtful" # 51-60
    elif 61 <= stress_level <= 75:
        return 45, "Neutral" # 41-50
    elif 76 <= stress_level <= 85:
        return 35, "Worried" # 31-40
    elif 86 <= stress_level <= 95:
        return 25, "Angry" # 21-30
    elif 96 <= stress_level <= 100:
        return 15, "Sad/Tired" # 10-20
    else:
        return 50, "Neutral" # Default or unhandled range

ALL_HEALTH_METRICS = [
    "heart_rates", "sleep", "stress", "respiration", "spo2",
    "intensity_minutes", "training_readiness", "training_status", "max_metrics",
    "hrv", "lactate_threshold", "endurance_score", "hill_score", "race_predictions",
    "blood_pressure", "body_battery", "menstrual_data", "floors", "fitness_age", "body_composition", "hydration",
    "recovery_time", "training_load", "acute_load"
]

class HealthAndWellnessRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    metric_types: list[str] = [] # Optional: if empty, fetch all

class GarminLoginRequest(BaseModel):
    email: str
    password: str
    user_id: str  # Sparky Fitness user ID
    # For MFA, if needed, a separate endpoint or a field in this model could be added


@app.get("/")
async def read_root():
    return {"message": "Garmin Connect Microservice is running!"}

@app.post("/data/health_and_wellness")
async def get_health_and_wellness(request_data: HealthAndWellnessRequest):
    """
    Retrieves a wide range of health, wellness, and achievement metrics from Garmin.
    user_id = request_data.user_id
    start_date = request_data.start_date
    end_date = request_data.end_date

    filename = "health_and_wellness_data.json"

    if GARMIN_DATA_SOURCE == "local":
        local_data = _load_from_local_file(filename)
        if local_data:
            logger.info(f"Returning local health and wellness data for user {user_id} from {start_date} to {end_date}.")
            return local_data
        else:
            raise HTTPException(status_code=404, detail=f"Local data not found for {start_date} to {end_date}. Please set GARMIN_DATA_SOURCE to 'garmin' to fetch and save data.")

    user_id = request_data.user_id
    start_date = request_data.start_date
    end_date = request_data.end_date

    filename = "health_and_wellness_data.json"

    if GARMIN_DATA_SOURCE == "local":
        local_data = _load_from_local_file(filename)
        if local_data:
            logger.info(f"Returning local health and wellness data for user {user_id} from {start_date} to {end_date}.")
            return local_data
        else:
            raise HTTPException(status_code=404, detail=f"Local data not found for {start_date} to {end_date}. Please set GARMIN_DATA_SOURCE to 'garmin' to fetch and save data.")

    """
    user_id = request_data.user_id
    start_date = request_data.start_date
    end_date = request_data.end_date

    filename = "health_and_wellness_data.json"

    if GARMIN_DATA_SOURCE == "local":
        local_data = _load_from_local_file(filename)
        if local_data:
            logger.info(f"Returning local health and wellness data for user {user_id} from {start_date} to {end_date}.")
            return local_data
        else:
            raise HTTPException(status_code=404, detail=f"Local data not found for {start_date} to {end_date}. Please set GARMIN_DATA_SOURCE to 'garmin' to fetch and save data.")

    try:
        tokens_b64 = request_data.tokens
        metric_types_to_fetch = request_data.metric_types if request_data.metric_types else ALL_HEALTH_METRICS

        if not user_id or not tokens_b64 or not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Missing user_id, tokens, start_date, or end_date.")

        garmin = Garmin(is_cn=IS_CN)
        garmin.login(tokenstore=tokens_b64)

        # Initialize health_data as a dictionary where each key is a metric type and the value is a list of daily entries
        health_data = {metric: [] for metric in ALL_HEALTH_METRICS}
        dates_to_fetch = get_dates_in_range(start_date, end_date)

        # Fetch metrics that are not date-dependent once
        if "lactate_threshold" in metric_types_to_fetch:
            try:
                lactate_threshold_data = garmin.get_lactate_threshold()
                if lactate_threshold_data:
                    # Associate with the start_date for consistency, or handle as a single entry
                    health_data["lactate_threshold"].append({"date": start_date, "lactate_threshold_hr": lactate_threshold_data.get("speed_and_heart_rate", {}).get("heartRate")})
            except Exception as e:
                logger.warning(f"Could not retrieve lactate threshold data: {e}")

        if "race_predictions" in metric_types_to_fetch:
            try:
                race_predictions_data = garmin.get_race_predictions()
                if race_predictions_data:
                    for prediction in race_predictions_data.get("racePredictionList", []):
                        if prediction.get("raceType") == "FIVE_K":
                            # Associate with the start_date for consistency
                            health_data["race_predictions"].append({"date": start_date, "race_prediction_5k": prediction.get("predictedTime")})
            except Exception as e:
                logger.warning(f"Could not retrieve race predictions data: {e}")

        if "pregnancy_summary" in metric_types_to_fetch:
            try:
                pregnancy_summary_data = garmin.get_pregnancy_summary()
                if pregnancy_summary_data:
                    # Associate with the start_date for consistency
                    health_data["pregnancy_summary"].append({"date": start_date, "data": pregnancy_summary_data})
            except Exception as e:
                logger.warning(f"Could not retrieve pregnancy summary data: {e}")

        for current_date in dates_to_fetch:
            # Daily Summary (steps, total_distance, highly_active_seconds, active_seconds, sedentary_seconds)
            if any(metric in metric_types_to_fetch for metric in ["steps", "total_distance", "highly_active_seconds", "active_seconds", "sedentary_seconds"]):
                try:
                    summary_data = garmin.get_user_summary(current_date)
                    if summary_data:
                        if "steps" in metric_types_to_fetch:
                            health_data["steps"].append({"date": current_date, "value": summary_data.get("totalSteps")})
                        if "total_distance" in metric_types_to_fetch:
                            health_data["total_distance"].append({"date": current_date, "value": safe_convert(summary_data.get("totalDistance"), meters_to_km)})
                        if "highly_active_seconds" in metric_types_to_fetch:
                            health_data["highly_active_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("highlyActiveSeconds"), seconds_to_minutes)})
                        if "active_seconds" in metric_types_to_fetch:
                            health_data["active_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("activeSeconds"), seconds_to_minutes)})
                        if "sedentary_seconds" in metric_types_to_fetch:
                            health_data["sedentary_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("sedentarySeconds"), seconds_to_minutes)})
                except Exception as e:
                    logger.warning(f"Could not retrieve daily summary for {current_date}: {e}")

            # Hydration
            if "hydration" in metric_types_to_fetch:
                try:
                    hydration_data = garmin.get_hydration_data(current_date)
                    if hydration_data and hydration_data.get("valueInML") is not None:
                        health_data["water"].append({"date": current_date, "value": hydration_data["valueInML"]})
                except Exception as e:
                    logger.warning(f"Could not retrieve hydration data for {current_date}: {e}")

            # Floors
            if "floors" in metric_types_to_fetch:
                try:
                    floors_data = garmin.get_floors(current_date)
                    if floors_data:
                        health_data["floors"].append({"date": current_date, "floors_ascended": floors_data.get("totalFloorsAscended"), "floors_descended": floors_data.get("totalFloorsDescended")})
                except Exception as e:
                    logger.warning(f"Could not retrieve floors data for {current_date}: {e}")

            # Fitness Age
            if "fitness_age" in metric_types_to_fetch:
                try:
                    fitness_age_data = garmin.get_fitnessage_data(current_date)
                    if fitness_age_data:
                        health_data["fitness_age"].append({"date": current_date, "fitness_age": fitness_age_data.get("fitnessAge"), "chronological_age": fitness_age_data.get("chronologicalAge"), "achievable_fitness_age": fitness_age_data.get("achievableFitnessAge")})
                except Exception as e:
                    logger.warning(f"Could not retrieve fitness age data for {current_date}: {e}")

            # Heart Rates
            if "heart_rates" in metric_types_to_fetch:
                try:
                    data = {"date": current_date, "HeartRate": []} # Initialize as dict
                    hr_list = garmin.get_heart_rates(current_date).get("heartRateValues") or []
                    for entry in hr_list:
                        if entry[1]:
                            data["HeartRate"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=pytz.timezone("UTC")).isoformat(), "data": entry[1]})
                    health_data["heart_rates"].append(data)
                except Exception as e:
                    logger.warning(f"Could not retrieve heart rate data for {current_date}: {e}")

            # Sleep
            if "sleep" in metric_types_to_fetch:
                try:
                    sleep_data_raw = garmin.get_sleep_data(current_date)
                    if sleep_data_raw:
                        sleep_summary = sleep_data_raw.get("dailySleepDTO", {})
                        
                        bedtime_dt = None
                        wake_time_dt = None

                        # Prioritize sleep_summary's sleepStartTimestampGMT and sleepEndTimestampGMT
                        if sleep_summary.get("sleepStartTimestampGMT") and sleep_summary.get("sleepEndTimestampGMT"):
                            bedtime_dt = datetime.fromtimestamp(sleep_summary["sleepStartTimestampGMT"] / 1000, tz=pytz.timezone("UTC"))
                            wake_time_dt = datetime.fromtimestamp(sleep_summary["sleepEndTimestampGMT"] / 1000, tz=pytz.timezone("UTC"))
                        else:
                            # Fallback to SleepStageLevel timestamps if summary timestamps are missing
                            stage_events_raw = sleep_data_raw.get('sleepLevels', [])
                            if stage_events_raw:
                                # Sort by startGMT to ensure correct order
                                sorted_stages = sorted(stage_events_raw, key=lambda x: datetime.strptime(x['startGMT'], '%Y-%m-%dT%H:%M:%S.%f'))
                                if sorted_stages:
                                    bedtime_dt = pytz.timezone("UTC").localize(datetime.strptime(sorted_stages[0]['startGMT'], '%Y-%m-%dT%H:%M:%S.%f'))
                                    wake_time_dt = pytz.timezone("UTC").localize(datetime.strptime(sorted_stages[-1]['endGMT'], '%Y-%m-%dT%H:%M:%S.%f'))
                        
                        # If we still don't have valid bedtime/wake_time, skip this entry
                        if not bedtime_dt or not wake_time_dt:
                            logger.warning(f"Skipping sleep entry for {current_date} due to missing or invalid bedtime/wake_time.")
                            continue

                        # Ensure duration_in_seconds is not None before using it
                        duration_in_seconds = sleep_summary.get("sleepTimeSeconds")
                        if duration_in_seconds is None:
                            duration_in_seconds = int((wake_time_dt - bedtime_dt).total_seconds())
                            logger.warning(f"sleepTimeSeconds is None for {current_date}. Calculated duration: {duration_in_seconds} seconds.")

                        sleep_entry_data = {
                            "entry_date": current_date, # This is the date the sleep record is associated with
                            "bedtime": bedtime_dt.isoformat(),
                            "wake_time": wake_time_dt.isoformat(),
                            "duration_in_seconds": duration_in_seconds,
                            "time_asleep_in_seconds": None, # Will be calculated from stage_events
                            "source": "garmin",
                            "sleep_score": ((sleep_summary.get("sleepScores") or {}).get("overall") or {}).get("value"),
                            # Other fields from sleep_summary
                            "deepSleepSeconds": 0,
                            "lightSleepSeconds": 0,
                            "remSleepSeconds": 0,
                            "awakeSleepSeconds": 0,
                            "averageSpO2Value": sleep_summary.get("averageSpO2Value"),
                            "lowestSpO2Value": sleep_summary.get("lowestSpO2Value"),
                            "highestSpO2Value": sleep_summary.get("highestSpO2Value"),
                            "averageRespirationValue": sleep_summary.get("averageRespirationValue"),
                            "lowestRespirationValue": sleep_summary.get("lowestRespirationValue"),
                            "highestRespirationValue": sleep_summary.get("highestRespirationValue"),
                            "awakeCount": sleep_summary.get("awakeCount"),
                            "avgSleepStress": sleep_summary.get("avgSleepStress"),
                            "restlessMomentsCount": sleep_data_raw.get("restlessMomentsCount"),
                            "avgOvernightHrv": sleep_data_raw.get("avgOvernightHrv"),
                            "bodyBatteryChange": sleep_data_raw.get("bodyBatteryChange"),
                            "restingHeartRate": sleep_data_raw.get("restingHeartRate"),
                            "stage_events": [] # This will be populated below
                        }

                        # Process Sleep Levels (Stages)
                        sleep_levels_intraday = sleep_data_raw.get("sleepLevels")
                        if sleep_levels_intraday:
                            for entry in sleep_levels_intraday:
                                if entry.get("activityLevel") is not None: # Include 0 for Deepsleep but not None
                                    start_time_dt = pytz.timezone("UTC").localize(datetime.strptime(entry["startGMT"], '%Y-%m-%dT%H:%M:%S.%f'))
                                    end_time_dt = pytz.timezone("UTC").localize(datetime.strptime(entry["endGMT"], '%Y-%m-%dT%H:%M:%S.%f'))
                                    duration_in_seconds_stage = int((end_time_dt - start_time_dt).total_seconds())
                                    
                                    stage_type_map = {
                                        0: 'awake',
                                        1: 'rem',
                                        2: 'light',
                                        3: 'deep'
                                    }
                                    stage_type = stage_type_map.get(entry["activityLevel"], 'unknown')

                                    sleep_entry_data["stage_events"].append({
                                        "stage_type": stage_type,
                                        "start_time": start_time_dt.isoformat(),
                                        "end_time": end_time_dt.isoformat(),
                                        "duration_in_seconds": duration_in_seconds_stage
                                    })
                                    # Sum up sleep stage durations
                                    if stage_type == 'deep':
                                        sleep_entry_data["deepSleepSeconds"] += duration_in_seconds_stage
                                    elif stage_type == 'light':
                                        sleep_entry_data["lightSleepSeconds"] += duration_in_seconds_stage
                                    elif stage_type == 'rem':
                                        sleep_entry_data["remSleepSeconds"] += duration_in_seconds_stage
                                    elif stage_type == 'awake':
                                        sleep_entry_data["awakeSleepSeconds"] += duration_in_seconds_stage

                            # Calculate total time_asleep_in_seconds from summed stages
                            sleep_entry_data["time_asleep_in_seconds"] = (
                                sleep_entry_data["deepSleepSeconds"] +
                                sleep_entry_data["lightSleepSeconds"] +
                                sleep_entry_data["remSleepSeconds"]
                            )
                        
                        # Only add to health_data if it's a valid sleep entry with at least basic info
                        if sleep_entry_data["duration_in_seconds"] is not None and sleep_entry_data["duration_in_seconds"] > 0:
                            health_data["sleep"].append(sleep_entry_data)
                        else:
                            logger.warning(f"Skipping sleep entry for {current_date} due to invalid duration_in_seconds or missing sleep data.")

                except Exception as e:
                    logger.warning(f"Could not retrieve sleep data for {current_date}: {e}")

                except Exception as e:
                    logger.warning(f"Could not retrieve sleep data for {current_date}: {e}")

            # Stress
            if "stress" in metric_types_to_fetch:
                try:
                    stress_data_entry = {
                        "date": current_date,
                        "stressLevel": [],
                        "BodyBatteryLevel": []
                    }
                    
                    stress_list = garmin.get_stress_data(current_date).get('stressValuesArray') or []
                    valid_stress_values = []
                    for entry in stress_list:
                        # Only include valid stress data points (0-100)
                        if entry[1] is not None and entry[1] >= 0:
                            stress_data_entry["stressLevel"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=pytz.timezone("UTC")).isoformat(), "stress_level": entry[1]})
                            valid_stress_values.append(entry[1])
                    
                    bb_list = garmin.get_stress_data(current_date).get('bodyBatteryValuesArray') or []
                    for entry in bb_list:
                        if entry[2] is not None and entry[2] >= 0: # Assuming BodyBatteryLevel is also non-negative
                            stress_data_entry["BodyBatteryLevel"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=pytz.timezone("UTC")).isoformat(), "stress_level": entry[2]})
                    
                    # Calculate average stress and map to mood
                    average_stress = None
                    derived_mood_value = None
                    derived_mood_notes = None

                    if valid_stress_values:
                        average_stress = sum(valid_stress_values) / len(valid_stress_values)
                        derived_mood_value, derived_mood_category = map_garmin_stress_to_mood(average_stress)
                        if derived_mood_value is not None:
                            derived_mood_notes = f"Derived from Garmin Stress: Average {average_stress:.0f} ({derived_mood_category})"
                    
                    # Add derived mood and raw stress data to the stress entry
                    stress_data_entry["raw_stress_data"] = stress_data_entry["stressLevel"] # Store raw stressLevel as list of dicts directly
                    stress_data_entry["derived_mood_value"] = derived_mood_value
                    stress_data_entry["derived_mood_notes"] = derived_mood_notes
                    
                    # Only append stress_data_entry if there's valid raw stress data or derived mood data
                    if stress_data_entry["stressLevel"] or stress_data_entry["derived_mood_value"] is not None:
                        health_data["stress"].append(stress_data_entry)
                    else:
                        logger.info(f"No valid stress data or derived mood for {current_date}, skipping entry.")
                except Exception as e:
                    logger.warning(f"Could not retrieve stress data for {current_date}: {e}")

            # Respiration
            if "respiration" in metric_types_to_fetch:
                try:
                    respiration_data = garmin.get_respiration_data(current_date)
                    if respiration_data:
                        health_data["respiration"].append({"date": current_date, "average_respiration_rate": respiration_data.get("avgRespiration")})
                except Exception as e:
                    logger.warning(f"Could not retrieve respiration data for {current_date}: {e}")

            # SpO2
            if "spo2" in metric_types_to_fetch:
                try:
                    spo2_data = garmin.get_spo2_data(current_date)
                    if spo2_data:
                        health_data["spo2"].append({"date": current_date, "average_spo2": spo2_data.get("avgSpO2")})
                except Exception as e:
                    logger.warning(f"Could not retrieve SPO2 data for {current_date}: {e}")

            # Intensity Minutes
            if "intensity_minutes" in metric_types_to_fetch:
                try:
                    intensity_minutes_data = garmin.get_intensity_minutes_data(current_date)
                    if intensity_minutes_data:
                        health_data["intensity_minutes"].append({"date": current_date, "total_intensity_minutes": intensity_minutes_data.get("total")})
                except Exception as e:
                    logger.warning(f"Could not retrieve intensity minutes data for {current_date}: {e}")

            # Training Readiness
            if "training_readiness" in metric_types_to_fetch:
                try:
                    training_readiness_data = garmin.get_training_readiness(current_date)
                    if training_readiness_data:
                        health_data["training_readiness"].append({"date": current_date, "training_readiness_score": training_readiness_data.get("score")})
                except Exception as e:
                    logger.warning(f"Could not retrieve training readiness data for {current_date}: {e}")

            # Training Status
            if "training_status" in metric_types_to_fetch:
                try:
                    training_status_data = garmin.get_training_status(current_date)
                    if training_status_data:
                        health_data["training_status"].append({"date": current_date, "status": training_status_data.get("status")})
                except Exception as e:
                    logger.warning(f"Could not retrieve training status data for {current_date}: {e}")

            # Max Metrics
            if "max_metrics" in metric_types_to_fetch:
                try:
                    max_metrics_data = garmin.get_max_metrics(current_date)
                    if max_metrics_data:
                        health_data["max_metrics"].append({"date": current_date, "vo2_max": max_metrics_data.get("vo2Max")})
                except Exception as e:
                    logger.warning(f"Could not retrieve max metrics data for {current_date}: {e}")

            # HRV
            if "hrv" in metric_types_to_fetch:
                try:
                    data = {}
                    data["date"] = current_date
                    data["hrvValue"] = []
                    hrv_list = (garmin.get_hrv_data(current_date) or {}).get('hrvReadings') or []
                    for entry in hrv_list:
                        if entry.get('hrvValue'):
                            data["hrvValue"].append({"time": pytz.timezone("UTC").localize(datetime.strptime(entry['readingTimeGMT'],"%Y-%m-%dT%H:%M:%S.%f")).isoformat(), "data": entry.get('hrvValue')})

                    health_data["hrv"].append(data)
                except Exception as e:
                    logger.warning(f"Could not retrieve HRV data for {current_date}: {e}")

            # Endurance Score
            if "endurance_score" in metric_types_to_fetch:
                try:
                    endurance_score_data = garmin.get_endurance_score(current_date, current_date)
                    if endurance_score_data:
                        health_data["endurance_score"].append({"date": current_date, "score": endurance_score_data.get("score")})
                except Exception as e:
                    logger.warning(f"Could not retrieve endurance score data for {current_date}: {e}")

            # Hill Score
            if "hill_score" in metric_types_to_fetch:
                try:
                    hill_score_data = garmin.get_hill_score(current_date, current_date)
                    if hill_score_data:
                        health_data["hill_score"].append({"date": current_date, "overall": hill_score_data.get("overall")})
                except Exception as e:
                    logger.warning(f"Could not retrieve hill score data for {current_date}: {e}")

            # Blood Pressure
            if "blood_pressure" in metric_types_to_fetch:
                try:
                    blood_pressure_data = garmin.get_blood_pressure(current_date, current_date)
                    logger.debug(f"Raw blood pressure data for {current_date}: {blood_pressure_data}")
                    if blood_pressure_data and blood_pressure_data.get("measurementSummaries"):
                        for summary in blood_pressure_data["measurementSummaries"]:
                            if summary.get("measurements"):
                                for bp_entry in summary["measurements"]:
                                    systolic = bp_entry.get("systolic")
                                    diastolic = bp_entry.get("diastolic")
                                    pulse = bp_entry.get("pulse")
                                    if systolic is not None and diastolic is not None:
                                        bp_value = f"{systolic}/{diastolic}"
                                        if pulse is not None:
                                            bp_value += f", {pulse} bpm"
                                        health_data["blood_pressure"].append({
                                            "date": current_date,
                                            "value": bp_value
                                        })
                                    else:
                                        logger.warning(f"Incomplete blood pressure data for {current_date}: {bp_entry}")
                            else:
                                logger.warning(f"No measurements found in blood pressure summary for {current_date}: {summary}")
                    else:
                        logger.debug(f"No blood pressure measurement summaries found for {current_date}.")
                except Exception as e:
                    logger.warning(f"Could not retrieve blood pressure data for {current_date}: {e}")

            # Body Battery
            if "body_battery" in metric_types_to_fetch:
                try:
                    body_battery_data = garmin.get_body_battery(current_date, current_date)
                    if body_battery_data and isinstance(body_battery_data, list) and len(body_battery_data) > 0:
                        for bb_entry in body_battery_data:
                            health_data["body_battery"].append({
                                "date": current_date,
                                "highest": bb_entry.get("highest"),
                                "lowest": bb_entry.get("lowest"),
                                "atWake": bb_entry.get("atWake"),
                                "charged": bb_entry.get("charged"),
                                "drained": bb_entry.get("drained")
                            })
                except Exception as e:
                    logger.warning(f"Could not retrieve body battery data for {current_date}: {e}")

            # Menstrual Data
            if "menstrual_data" in metric_types_to_fetch:
                try:
                    menstrual_data = garmin.get_menstrual_data_for_date(current_date)
                    if menstrual_data:
                        health_data["menstrual_data"].append({"date": current_date, "data": menstrual_data})
                except Exception as e:
                    logger.warning(f"Could not retrieve menstrual data for {current_date}: {e}")

            # Menstrual Calendar Data
            if "menstrual_calendar_data" in metric_types_to_fetch:
                try:
                    menstrual_calendar_data = garmin.get_menstrual_calendar_data(current_date, current_date)
                    if menstrual_calendar_data:
                        health_data["menstrual_calendar_data"].append({"date": current_date, "data": menstrual_calendar_data})
                except Exception as e:
                    logger.warning(f"Could not retrieve menstrual calendar data for {current_date}: {e}")

            # Body Composition
            if "body_composition" in metric_types_to_fetch:
                try:
                    body_composition_data = garmin.get_body_composition(current_date, current_date)
                    if body_composition_data and body_composition_data.get("dateWeightList"):
                        for entry in body_composition_data["dateWeightList"]:
                            health_data["body_composition"].append({
                                "date": entry.get("date"), # Use the date from the entry itself
                                "weight": safe_convert(entry.get("weight"), grams_to_kg),
                                "body_fat_percentage": entry.get("bodyFat"),
                                "bmi": entry.get("bmi"),
                                "body_water_percentage": entry.get("bodyWater"),
                                "bone_mass": entry.get("boneMass"),
                                "muscle_mass": entry.get("muscleMass")
                            })
                except Exception as e:
                    logger.warning(f"Could not retrieve body composition data for {current_date}: {e}")

            # Recovery Time
            if "recovery_time" in metric_types_to_fetch:
                try:
                    training_readiness_data = garmin.get_training_readiness(current_date)
                    if training_readiness_data and len(training_readiness_data) > 0:
                        recovery_time_value = training_readiness_data[0].get("recoveryTime")
                        if recovery_time_value is not None:
                            health_data["recovery_time"].append({"date": current_date, "value": recovery_time_value})
                except Exception as e:
                    logger.warning(f"Could not retrieve recovery time data for {current_date}: {e}")

            # Training Load and Acute Load
            if "training_load" in metric_types_to_fetch or "acute_load" in metric_types_to_fetch:
                try:
                    training_status_data = garmin.get_training_status(current_date)
                    if training_status_data and training_status_data.get("mostRecentTrainingStatus"):
                        # Assuming there's only one device or we take the first one
                        ts_dict = next(iter(training_status_data["mostRecentTrainingStatus"].get("latestTrainingStatusData", {}).values()), None)
                        if ts_dict:
                            if "training_load" in metric_types_to_fetch:
                                weekly_load = ts_dict.get("weeklyTrainingLoad")
                                daily_acute_load_ts = (ts_dict.get("acuteTrainingLoadDTO") or {}).get("dailyTrainingLoadAcute")
                                daily_chronic_load = (ts_dict.get("acuteTrainingLoadDTO") or {}).get("dailyTrainingLoadChronic")
                                if weekly_load is not None or daily_acute_load_ts is not None or daily_chronic_load is not None:
                                    health_data["training_load"].append({
                                        "date": current_date,
                                        "weekly_training_load": weekly_load,
                                        "daily_acute_training_load": daily_acute_load_ts,
                                        "daily_chronic_training_load": daily_chronic_load
                                    })
                            if "acute_load" in metric_types_to_fetch:
                                # Acute load also available from training readiness
                                training_readiness_data = garmin.get_training_readiness(current_date)
                                if training_readiness_data and len(training_readiness_data) > 0:
                                    acute_load_value = training_readiness_data[0].get("acuteLoad")
                                    if acute_load_value is not None:
                                        health_data["acute_load"].append({"date": current_date, "value": acute_load_value})
                except Exception as e:
                    logger.warning(f"Could not retrieve training load/acute load data for {current_date}: {e}")

        logger.debug(f"Health data before cleaning: {health_data}")
        # Clean and filter the data
        cleaned_health_data = clean_garmin_data(health_data)

        # Further filter to remove null or empty values before returning
        final_health_data = {k: v for k, v in cleaned_health_data.items() if v} # Filter out empty lists
        
        # Save data to local file if GARMIN_DATA_SOURCE is not "local"
        _save_to_local_file(filename, {"user_id": user_id, "start_date": start_date, "end_date": end_date, "data": final_health_data})

        logger.debug(f"Final health data being returned: {final_health_data}")
        logger.info(f"Successfully retrieved and cleaned health and wellness data for user {user_id} from {start_date} to {end_date}. Data: {final_health_data}")
        
        # Save data to local file if GARMIN_DATA_SOURCE is not "local"
        _save_to_local_file(filename, {"user_id": user_id, "start_date": start_date, "end_date": end_date, "data": final_health_data})

        return {"user_id": user_id, "start_date": start_date, "end_date": end_date, "data": final_health_data}

    except GarthHTTPError as e:
        logger.error(f"Garmin API error (health_and_wellness): {e}")
        raise HTTPException(status_code=500, detail=f"Garmin API error: {e}")
    except GarthException as e:
        logger.error(f"Error retrieving health and wellness data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve health and wellness data: {e}")
    except Exception as e:
        logger.error(f"Unexpected error retrieving health and wellness data: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

class ActivitiesAndWorkoutsRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    activity_type: str = None

@app.post("/data/activities_and_workouts")
async def get_activities_and_workouts(request_data: ActivitiesAndWorkoutsRequest):
    """
    Retrieves detailed activity and workout data from Garmin.
    """
    user_id = request_data.user_id
    start_date = request_data.start_date
    end_date = request_data.end_date
    activity_type = request_data.activity_type

    filename = "activities_and_workouts_data.json"

    if GARMIN_DATA_SOURCE == "local":
        local_data = _load_from_local_file(filename)
        if local_data:
            logger.info(f"Returning local activities and workouts data for user {user_id} from {start_date} to {end_date}.")
            return local_data
        else:
            raise HTTPException(status_code=404, detail=f"Local data not found for {start_date} to {end_date}. Please set GARMIN_DATA_SOURCE to 'garmin' to fetch and save data.")

    try:
        tokens_b64 = request_data.tokens

        if not user_id or not tokens_b64 or not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Missing user_id, tokens, start_date, or end_date.")

        garmin = Garmin(is_cn=IS_CN)
        garmin.login(tokenstore=tokens_b64)

        logger.info(f"Fetching activities for user {user_id} from {start_date} to {end_date} with activity type {activity_type}")
        activities = garmin.get_activities_by_date(start_date, end_date, activity_type)
        logger.debug(f"Raw activities retrieved: {activities}")

        # Ensure activityName is set from typeKey if it's missing
        for activity in activities:
            if not activity.get('activityName') and activity.get('activityType', {}).get('typeKey'):
                activity['activityName'] = activity['activityType']['typeKey'].replace('_', ' ').title()

        converted_activities = convert_activities_units(activities)
        logger.debug(f"Converted activities: {converted_activities}")

        detailed_activities = []
        for activity in converted_activities:
            activity_id = activity["activityId"]
            try:
                activity_details = garmin.get_activity_details(activity_id)
                activity_splits = garmin.get_activity_splits(activity_id)
                activity_weather = garmin.get_activity_weather(activity_id)
                activity_hr_in_timezones = garmin.get_activity_hr_in_timezones(activity_id)
                activity_exercise_sets = garmin.get_activity_exercise_sets(activity_id)
                activity_gear = garmin.get_activity_gear(activity_id)

                # Extract Cadence and Power from activity_details if available
                extracted_cadence = None
                extracted_power = None
                if activity_details and isinstance(activity_details, dict):
                    # Common keys for cadence and power in activity details
                    # These might be nested, so we'll look for them in common places
                    # This is a heuristic based on typical Garmin data structures
                    if activity_details.get("metrics"):
                        for metric in activity_details["metrics"]:
                            if metric.get("metricName") == "cadence":
                                extracted_cadence = metric.get("value")
                            if metric.get("metricName") == "power":
                                extracted_power = metric.get("value")
                    # Also check top-level or other common locations
                    extracted_cadence = extracted_cadence or activity_details.get("avgCadence") or activity_details.get("averageCadence")
                    extracted_power = extracted_power or activity_details.get("avgPower") or activity_details.get("averagePower")

                detailed_activities.append({
                    "activity": {
                        **activity,
                        "cadence": extracted_cadence,
                        "power": extracted_power
                    },
                    "details": json.dumps(clean_garmin_data(activity_details)) if activity_details else None,
                    "splits": json.dumps(clean_garmin_data(activity_splits)) if activity_splits else None,
                    "weather": json.dumps(clean_garmin_data(activity_weather)) if activity_weather else None,
                    "hr_in_timezones": json.dumps(clean_garmin_data(activity_hr_in_timezones)) if activity_hr_in_timezones else None,
                    "exercise_sets": json.dumps(clean_garmin_data(activity_exercise_sets)) if activity_exercise_sets else None,
                    "gear": json.dumps(clean_garmin_data(activity_gear)) if activity_gear else None
                })
            except Exception as e:
                logger.warning(f"Could not retrieve details for activity ID {activity_id}: {e}")
                # Append activity even if details fail, but without the failed details
                detailed_activities.append({"activity": activity})

        logger.info(f"Fetching workouts for user {user_id}")
        workouts = garmin.get_workouts()
        print(f"Raw workouts retrieved: {workouts}")
        detailed_workouts = []
        for workout in workouts:
            workout_id = workout["workoutId"]
            try:
                workout_details = garmin.get_workout_by_id(workout_id)
                detailed_workouts.append(workout_details)
            except Exception as e:
                logger.warning(f"Could not retrieve details for workout ID {workout_id}: {e}")
                # Append workout even if details fail, but without the failed details
                detailed_workouts.append(workout)

        # Clean and filter the data
        cleaned_activities = clean_garmin_data(detailed_activities)
        cleaned_workouts =  clean_garmin_data(detailed_workouts)

        logger.info(f"Successfully retrieved and cleaned activities and workouts for user {user_id} from {start_date} to {end_date}. Activities: {cleaned_activities}, Workouts: {cleaned_workouts}")
        
        # Save data to local file if GARMIN_DATA_SOURCE is not "local"
        _save_to_local_file(filename, {
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date,
            "activities": cleaned_activities,
            "workouts": cleaned_workouts
        })

        return {
            "user_id": user_id,
            "start_date": start_date,
            "end_date": end_date,
            "activities": cleaned_activities,
            "workouts": cleaned_workouts
        }

    except GarthHTTPError as e:
        logger.error(f"Garmin API error (activities_and_workouts): {e}")
        raise HTTPException(status_code=500, detail=f"Garmin API error: {e}")
    except GarthException as e:
        logger.error(f"Error retrieving activities and workouts: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve activities and workouts: {e}")
    except Exception as e:
        logger.error(f"Unexpected error retrieving activities and workouts: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")

@app.post("/auth/garmin/login")
async def garmin_login(request_data: GarminLoginRequest):
    """
    Performs direct login to Garmin Connect using email and password.
    Returns base64 encoded tokens or an MFA challenge.
    """
    try:
        garmin = Garmin(email=request_data.email, password=request_data.password, is_cn=IS_CN, return_on_mfa=True)
        result1, result2 = garmin.login()
        if result1 == "needs_mfa":
            mfa_id = uuid.uuid4().hex
            MFA_STATE_STORE[mfa_id] = {"state": result2, "ts": time.time()}
            _cleanup_mfa_cache()
            logger.info(f"MFA required for user {request_data.user_id}, mfa_id={mfa_id}.")
            # In a real application, you'd store client_state (result2) and prompt user for MFA code
            # For this POC, we'll return a specific status.
            return {"status": "needs_mfa", "client_state": mfa_id}
        else:
            tokens = garmin.garth.dumps()  # Base64 encoded string of tokens
            logger.info(f"Successfully obtained Garmin tokens for user {request_data.user_id}.")
            return {"status": "success", "tokens": tokens}

    except GarthHTTPError as e:
        logger.error(f"Garmin login error: {e}")
        raise HTTPException(status_code=500, detail=f"Garmin login error: {e}")
    except GarthException as e:
        logger.error(f"Error during Garmin login: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to login to Garmin: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during Garmin login: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")


@app.post("/auth/garmin/resume_login")
async def garmin_resume_login(request: Request):
    """
    Resumes Garmin login after MFA code is provided.
    """
    try:
        data = await request.json()
        client_state = data.get("client_state")
        mfa_code = data.get("mfa_code")
        user_id = data.get("user_id")  # Sparky Fitness user ID
        
        if not client_state or not mfa_code or not user_id:
            raise HTTPException(status_code=400, detail="Missing client_state, mfa_code, or user_id.")

        item = MFA_STATE_STORE.pop(client_state, None)
        if not item:
            raise HTTPException(status_code=400, detail="Invalid or expired mfa_token")
        client_state = item["state"]

        garmin = Garmin(is_cn=IS_CN)  # Initialize an empty Garmin object
        garmin.resume_login(client_state, mfa_code)
        tokens = garmin.garth.dumps()
        logger.info(f"Successfully resumed Garmin login for user {user_id}.")
        return {"status": "success", "tokens": tokens}

    except GarthHTTPError as e:
        logger.error(f"Garmin MFA error: {e}")
        raise HTTPException(status_code=500, detail=f"Garmin MFA error: {e}")
    except GarthException as e:
        logger.error(f"Error during Garmin MFA: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to complete Garmin MFA: {e}")
    except Exception as e:
        logger.error(f"Unexpected error during Garmin MFA: {e}")
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {e}")



if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
