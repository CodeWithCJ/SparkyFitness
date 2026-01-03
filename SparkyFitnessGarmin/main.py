import logging
import uuid
import time
import os
import json # Import the json module
from datetime import date, timedelta, datetime, timezone # Import date, timedelta, and timezone
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from urllib.parse import urlencode, parse_qs
from pydantic import BaseModel
import uvicorn
from garminconnect import Garmin
from garth.exc import GarthHTTPError, GarthException
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
    Recursively remove fields that are None or specific Garmin internal IDs.
    Also, attempt to parse strings that are valid JSON.
    Note: Zero values are kept as they can be legitimate (0 steps, 0 floors, etc.)
    """
    if isinstance(data, dict):
        cleaned_dict = {}
        for k, v in data.items():
            if v is not None and k not in ['ownerId', 'userProfilePk', 'permissionId', 'userRoles', 'equipmentTypeId'] and 'endConditionCompare' not in k:
                cleaned_value = clean_garmin_data(v)
                if cleaned_value is not None:
                    cleaned_dict[k] = cleaned_value
        return cleaned_dict if cleaned_dict else None
    elif isinstance(data, list):
        cleaned_list = [clean_garmin_data(item) for item in data]
        return [item for item in cleaned_list if item is not None]
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
    # Daily summary metrics
    "steps", "total_distance", "highly_active_seconds", "active_seconds", "sedentary_seconds",
    # Health metrics
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
                    # Map Garmin race types to our field names
                    race_type_map = {
                        "FIVE_K": "race_prediction_5k",
                        "TEN_K": "race_prediction_10k",
                        "HALF_MARATHON": "race_prediction_half_marathon",
                        "MARATHON": "race_prediction_marathon"
                    }
                    race_entry = {"date": start_date}
                    for prediction in race_predictions_data.get("racePredictionList", []):
                        race_type = prediction.get("raceType")
                        if race_type in race_type_map:
                            race_entry[race_type_map[race_type]] = prediction.get("predictedTime")
                    # Only add if we have at least one prediction
                    if len(race_entry) > 1:
                        health_data["race_predictions"].append(race_entry)
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
            logger.info(f"[GARMIN_SYNC] Fetching data for date: {current_date}")

            # Daily Summary (steps, total_distance, highly_active_seconds, active_seconds, sedentary_seconds, body_battery)
            if any(metric in metric_types_to_fetch for metric in ["steps", "total_distance", "highly_active_seconds", "active_seconds", "sedentary_seconds", "body_battery"]):
                try:
                    summary_data = garmin.get_user_summary(current_date)
                    logger.info(f"[GARMIN_SYNC] get_user_summary({current_date}) RAW RESPONSE KEYS: {list(summary_data.keys()) if summary_data else None}")
                    if summary_data:
                        if "steps" in metric_types_to_fetch:
                            health_data["steps"].append({"date": current_date, "value": summary_data.get("totalSteps")})
                        if "total_distance" in metric_types_to_fetch:
                            distance = summary_data.get("totalDistance") or summary_data.get("totalDistanceMeters") or summary_data.get("distance")
                            health_data["total_distance"].append({"date": current_date, "value": safe_convert(distance, meters_to_km)})
                        if "highly_active_seconds" in metric_types_to_fetch:
                            health_data["highly_active_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("highlyActiveSeconds"), seconds_to_minutes)})
                        if "active_seconds" in metric_types_to_fetch:
                            health_data["active_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("activeSeconds"), seconds_to_minutes)})
                        if "sedentary_seconds" in metric_types_to_fetch:
                            health_data["sedentary_seconds"].append({"date": current_date, "value": safe_convert(summary_data.get("sedentarySeconds"), seconds_to_minutes)})
                        # Body Battery from user_summary (preferred source)
                        if "body_battery" in metric_types_to_fetch:
                            bb_highest = summary_data.get("bodyBatteryHighestValue")
                            bb_lowest = summary_data.get("bodyBatteryLowestValue")
                            bb_at_wake = summary_data.get("bodyBatteryAtWakeTime")
                            bb_charged = summary_data.get("bodyBatteryChargedValue")
                            bb_drained = summary_data.get("bodyBatteryDrainedValue")
                            bb_current = summary_data.get("bodyBatteryMostRecentValue")
                            if any([bb_highest, bb_lowest, bb_at_wake, bb_charged, bb_drained]):
                                logger.info(f"[GARMIN_SYNC] Body battery from user_summary: highest={bb_highest}, lowest={bb_lowest}, atWake={bb_at_wake}, charged={bb_charged}, drained={bb_drained}, current={bb_current}")
                                health_data["body_battery"].append({
                                    "date": current_date,
                                    "body_battery_highest": bb_highest,
                                    "body_battery_lowest": bb_lowest,
                                    "body_battery_at_wake": bb_at_wake,
                                    "body_battery_charged": bb_charged,
                                    "body_battery_drained": bb_drained,
                                    "body_battery_current": bb_current
                                })
                except Exception as e:
                    logger.warning(f"Could not retrieve daily summary for {current_date}: {e}")

            # Hydration
            if "hydration" in metric_types_to_fetch:
                try:
                    hydration_data = garmin.get_hydration_data(current_date)
                    if hydration_data and hydration_data.get("valueInML") is not None:
                        health_data["hydration"].append({"date": current_date, "hydration": hydration_data["valueInML"]})
                except Exception as e:
                    logger.warning(f"Could not retrieve hydration data for {current_date}: {e}")

            # Floors
            if "floors" in metric_types_to_fetch:
                try:
                    floors_data = garmin.get_floors(current_date)
                    if floors_data:
                        ascended = None
                        descended = None

                        # First try direct totals
                        ascended = floors_data.get("totalFloorsAscended") or floors_data.get("floorsAscended")
                        descended = floors_data.get("totalFloorsDescended") or floors_data.get("floorsDescended")

                        # If not found, sum from floorValuesArray (intraday data)
                        # Format: [startTime, endTime, floorsAscended, floorsDescended]
                        if ascended is None and floors_data.get("floorValuesArray"):
                            floor_values = floors_data.get("floorValuesArray", [])
                            ascended = sum(entry[2] for entry in floor_values if len(entry) > 2 and entry[2] is not None)
                            descended = sum(entry[3] for entry in floor_values if len(entry) > 3 and entry[3] is not None)
                            logger.info(f"[GARMIN_SYNC] Floors summed from floorValuesArray: ascended={ascended}, descended={descended}")

                        if ascended is not None or descended is not None:
                            health_data["floors"].append({"date": current_date, "floors_ascended": ascended, "floors_descended": descended})
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
                            data["HeartRate"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=timezone.utc).isoformat(), "data": entry[1]})
                    health_data["heart_rates"].append(data)
                except Exception as e:
                    logger.warning(f"Could not retrieve heart rate data for {current_date}: {e}")

            # Sleep
            if "sleep" in metric_types_to_fetch:
                try:
                    sleep_data_raw = garmin.get_sleep_data(current_date)
                    logger.info(f"[GARMIN_SYNC] get_sleep_data({current_date}) dailySleepDTO keys: {list(sleep_data_raw.get('dailySleepDTO', {}).keys()) if sleep_data_raw else None}")
                    if sleep_data_raw:
                        sleep_summary = sleep_data_raw.get("dailySleepDTO", {})
                        
                        bedtime_dt = None
                        wake_time_dt = None

                        # Prioritize sleep_summary's sleepStartTimestampGMT and sleepEndTimestampGMT
                        if sleep_summary.get("sleepStartTimestampGMT") and sleep_summary.get("sleepEndTimestampGMT"):
                            bedtime_dt = datetime.fromtimestamp(sleep_summary["sleepStartTimestampGMT"] / 1000, tz=timezone.utc)
                            wake_time_dt = datetime.fromtimestamp(sleep_summary["sleepEndTimestampGMT"] / 1000, tz=timezone.utc)
                        else:
                            # Fallback to SleepStageLevel timestamps if summary timestamps are missing
                            stage_events_raw = sleep_data_raw.get('sleepLevels', [])
                            if stage_events_raw:
                                # Sort by startGMT to ensure correct order
                                sorted_stages = sorted(stage_events_raw, key=lambda x: datetime.strptime(x['startGMT'], '%Y-%m-%dT%H:%M:%S.%f'))
                                if sorted_stages:
                                    bedtime_dt = datetime.strptime(sorted_stages[0]['startGMT'], '%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc)
                                    wake_time_dt = datetime.strptime(sorted_stages[-1]['endGMT'], '%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc)
                        
                        # If we still don't have valid bedtime/wake_time, skip this sleep entry (but continue with other metrics)
                        if not bedtime_dt or not wake_time_dt:
                            logger.warning(f"Skipping sleep entry for {current_date} due to missing or invalid bedtime/wake_time.")
                        else:
                            # Ensure duration_in_seconds is not None before using it
                            duration_in_seconds = sleep_summary.get("sleepTimeSeconds")
                            if duration_in_seconds is None:
                                duration_in_seconds = int((wake_time_dt - bedtime_dt).total_seconds())
                                logger.warning(f"sleepTimeSeconds is None for {current_date}. Calculated duration: {duration_in_seconds} seconds.")

                            # Get sleep stage durations from dailySleepDTO first (preferred)
                            deep_sleep = sleep_summary.get("deepSleepSeconds") or 0
                            light_sleep = sleep_summary.get("lightSleepSeconds") or 0
                            rem_sleep = sleep_summary.get("remSleepSeconds") or 0
                            awake_sleep = sleep_summary.get("awakeSleepSeconds") or sleep_summary.get("awakeDuringSleepSeconds") or 0
                            logger.info(f"[GARMIN_SYNC] Sleep stages from dailySleepDTO: deep={deep_sleep}, light={light_sleep}, rem={rem_sleep}, awake={awake_sleep}")

                            sleep_entry_data = {
                                "entry_date": current_date, # This is the date the sleep record is associated with
                                "bedtime": bedtime_dt.isoformat(),
                                "wake_time": wake_time_dt.isoformat(),
                                "duration_in_seconds": duration_in_seconds,
                                "time_asleep_in_seconds": None, # Will be calculated from stage_events
                                "source": "garmin",
                                "sleep_score": ((sleep_summary.get("sleepScores") or {}).get("overall") or {}).get("value"),
                                # Sleep stage durations from dailySleepDTO (snake_case for database)
                                "deep_sleep_seconds": deep_sleep,
                                "light_sleep_seconds": light_sleep,
                                "rem_sleep_seconds": rem_sleep,
                                "awake_sleep_seconds": awake_sleep,
                                # SpO2 data (snake_case for database)
                                "average_spo2_value": sleep_summary.get("averageSpO2Value"),
                                "lowest_spo2_value": sleep_summary.get("lowestSpO2Value"),
                                "highest_spo2_value": sleep_summary.get("highestSpO2Value"),
                                # Respiration data (snake_case for database)
                                "average_respiration_value": sleep_summary.get("averageRespirationValue"),
                                "lowest_respiration_value": sleep_summary.get("lowestRespirationValue"),
                                "highest_respiration_value": sleep_summary.get("highestRespirationValue"),
                                # Other sleep metrics (snake_case for database)
                                "awake_count": sleep_summary.get("awakeCount"),
                                "avg_sleep_stress": sleep_summary.get("avgSleepStress"),
                                "restless_moments_count": sleep_data_raw.get("restlessMomentsCount"),
                                "avg_overnight_hrv": sleep_data_raw.get("avgOvernightHrv"),
                                "body_battery_change": sleep_data_raw.get("bodyBatteryChange"),
                                "resting_heart_rate": sleep_data_raw.get("restingHeartRate"),
                                "stage_events": [], # This will be populated below
                                "has_detailed_stages": True  # Will be set to False if using synthetic stages
                            }

                            # Process Sleep Levels (Stages) - only sum if dailySleepDTO didn't have the values
                            sleep_levels_intraday = sleep_data_raw.get("sleepLevels")
                            logger.info(f"[GARMIN_SYNC] sleepLevels for {current_date}: {len(sleep_levels_intraday) if sleep_levels_intraday else 'None'}")
                            needs_stage_sum = (deep_sleep == 0 and light_sleep == 0 and rem_sleep == 0)

                            if sleep_levels_intraday:
                                for entry in sleep_levels_intraday:
                                    if entry.get("activityLevel") is not None: # Include 0 for Deepsleep but not None
                                        start_time_dt = datetime.strptime(entry["startGMT"], '%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc)
                                        end_time_dt = datetime.strptime(entry["endGMT"], '%Y-%m-%dT%H:%M:%S.%f').replace(tzinfo=timezone.utc)
                                        duration_in_seconds_stage = int((end_time_dt - start_time_dt).total_seconds())

                                        # Garmin activityLevel: 0=deep, 1=light, 2=rem, 3+=awake
                                        stage_type_map = {
                                            0: 'deep',
                                            1: 'light',
                                            2: 'rem',
                                            3: 'awake'
                                        }
                                        stage_type = stage_type_map.get(entry["activityLevel"], 'unknown')

                                        sleep_entry_data["stage_events"].append({
                                            "stage_type": stage_type,
                                            "start_time": start_time_dt.isoformat(),
                                            "end_time": end_time_dt.isoformat(),
                                            "duration_in_seconds": duration_in_seconds_stage
                                        })

                                        # Only sum from sleepLevels if dailySleepDTO didn't have values
                                        if needs_stage_sum:
                                            if stage_type == 'deep':
                                                sleep_entry_data["deep_sleep_seconds"] += duration_in_seconds_stage
                                            elif stage_type == 'light':
                                                sleep_entry_data["light_sleep_seconds"] += duration_in_seconds_stage
                                            elif stage_type == 'rem':
                                                sleep_entry_data["rem_sleep_seconds"] += duration_in_seconds_stage
                                            elif stage_type == 'awake':
                                                sleep_entry_data["awake_sleep_seconds"] += duration_in_seconds_stage
                            else:
                                # Fallback: Create synthetic stage events from summary durations
                                # This allows hypnogram charts to at least show sleep stage proportions
                                # when detailed intraday data is not available (common for historical data)
                                logger.info(f"[GARMIN_SYNC] No sleepLevels for {current_date}, creating synthetic stages from summary")
                                sleep_entry_data["has_detailed_stages"] = False  # Mark as synthetic data
                                current_time = bedtime_dt

                                # Order: deep -> light -> rem -> awake (typical sleep cycle order)
                                stages_to_create = [
                                    ('deep', deep_sleep),
                                    ('light', light_sleep),
                                    ('rem', rem_sleep),
                                    ('awake', awake_sleep)
                                ]

                                for stage_type, stage_seconds in stages_to_create:
                                    if stage_seconds and stage_seconds > 0:
                                        end_time = current_time + timedelta(seconds=stage_seconds)
                                        sleep_entry_data["stage_events"].append({
                                            "stage_type": stage_type,
                                            "start_time": current_time.isoformat(),
                                            "end_time": end_time.isoformat(),
                                            "duration_in_seconds": stage_seconds
                                        })
                                        current_time = end_time

                                logger.info(f"[GARMIN_SYNC] Created {len(sleep_entry_data['stage_events'])} synthetic stage events")

                            # Calculate total time_asleep_in_seconds
                            sleep_entry_data["time_asleep_in_seconds"] = (
                                sleep_entry_data["deep_sleep_seconds"] +
                                sleep_entry_data["light_sleep_seconds"] +
                                sleep_entry_data["rem_sleep_seconds"]
                            )

                            # Only add to health_data if it's a valid sleep entry with at least basic info
                            if sleep_entry_data["duration_in_seconds"] is not None and sleep_entry_data["duration_in_seconds"] > 0:
                                health_data["sleep"].append(sleep_entry_data)
                            else:
                                logger.warning(f"Skipping sleep entry for {current_date} due to invalid duration_in_seconds or missing sleep data.")

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

                    # Fetch stress data once and extract both arrays
                    stress_response = garmin.get_stress_data(current_date)
                    stress_list = stress_response.get('stressValuesArray') or []
                    bb_list = stress_response.get('bodyBatteryValuesArray') or []

                    valid_stress_values = []
                    for entry in stress_list:
                        # Only include valid stress data points (0-100)
                        if entry[1] is not None and entry[1] >= 0:
                            stress_data_entry["stressLevel"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=timezone.utc).isoformat(), "stress_level": entry[1]})
                            valid_stress_values.append(entry[1])

                    for entry in bb_list:
                        if entry[2] is not None and entry[2] >= 0: # Assuming BodyBatteryLevel is also non-negative
                            stress_data_entry["BodyBatteryLevel"].append({"time": datetime.fromtimestamp(entry[0]/1000, tz=timezone.utc).isoformat(), "stress_level": entry[2]})
                    
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
                    logger.info(f"[GARMIN_SYNC] get_respiration_data({current_date}) RAW RESPONSE: {respiration_data}")
                    if respiration_data:
                        # Try to get both sleep and awake respiration values
                        sleep_resp = respiration_data.get("avgSleepRespirationValue")
                        awake_resp = respiration_data.get("avgWakingRespirationValue")
                        # Fallback to general average if specific values not available
                        avg_resp = respiration_data.get("avgRespiration")

                        logger.info(f"[GARMIN_SYNC] Respiration: sleep={sleep_resp}, awake={awake_resp}, avg={avg_resp}")

                        if sleep_resp or awake_resp or avg_resp:
                            health_data["respiration"].append({
                                "date": current_date,
                                "sleep_respiration_avg": sleep_resp,
                                "awake_respiration_avg": awake_resp,
                                "average_respiration_rate": avg_resp or sleep_resp or awake_resp  # Keep for backwards compatibility
                            })
                except Exception as e:
                    logger.warning(f"Could not retrieve respiration data for {current_date}: {e}")

            # SpO2
            if "spo2" in metric_types_to_fetch:
                try:
                    spo2_data = garmin.get_spo2_data(current_date)
                    logger.info(f"[GARMIN_SYNC] get_spo2_data({current_date}) RAW RESPONSE: {spo2_data}")
                    avg_spo2 = None

                    if spo2_data:
                        # Try multiple possible field names for SpO2 average
                        avg_spo2 = spo2_data.get("avgSpO2") or spo2_data.get("averageSpO2") or spo2_data.get("average") or spo2_data.get("latestSpO2Value")

                        # Check if data is in nested structure
                        if not avg_spo2 and spo2_data.get("dailySpO2Values"):
                            daily_values = spo2_data.get("dailySpO2Values", [])
                            if daily_values:
                                # Get average from daily values
                                spo2_readings = [v.get("spO2") or v.get("value") for v in daily_values if v.get("spO2") or v.get("value")]
                                if spo2_readings:
                                    avg_spo2 = sum(spo2_readings) / len(spo2_readings)
                                    logger.info(f"[GARMIN_SYNC] SpO2 calculated from dailySpO2Values: {avg_spo2}")

                        # Check for allDaySpO2 structure
                        if not avg_spo2 and spo2_data.get("allDaySpO2"):
                            all_day = spo2_data.get("allDaySpO2", {})
                            avg_spo2 = all_day.get("averageValue") or all_day.get("avg") or all_day.get("avgSpO2")
                            if avg_spo2:
                                logger.info(f"[GARMIN_SYNC] SpO2 from allDaySpO2: {avg_spo2}")

                    # Fallback: Try to get SpO2 from sleep data (already fetched)
                    if not avg_spo2 and health_data.get("sleep"):
                        for sleep_entry in health_data["sleep"]:
                            if sleep_entry.get("entry_date") == current_date and sleep_entry.get("average_spo2_value"):
                                avg_spo2 = sleep_entry.get("average_spo2_value")
                                logger.info(f"[GARMIN_SYNC] SpO2 from sleep data fallback: {avg_spo2}")
                                break

                    if avg_spo2:
                        health_data["spo2"].append({"date": current_date, "average_spo2": avg_spo2})
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
                    logger.info(f"[GARMIN_SYNC] get_training_readiness({current_date}) RAW RESPONSE: {training_readiness_data}")
                    if training_readiness_data:
                        # API returns a list, not a dict
                        if isinstance(training_readiness_data, list) and len(training_readiness_data) > 0:
                            first_item = training_readiness_data[0]
                            score = first_item.get("score") or first_item.get("trainingReadinessScore") or first_item.get("value")
                            if score:
                                health_data["training_readiness"].append({"date": current_date, "training_readiness_score": score})
                        elif isinstance(training_readiness_data, dict):
                            score = training_readiness_data.get("score") or training_readiness_data.get("trainingReadinessScore")
                            if score:
                                health_data["training_readiness"].append({"date": current_date, "training_readiness_score": score})
                except Exception as e:
                    logger.warning(f"Could not retrieve training readiness data for {current_date}: {e}")

            # Training Status
            if "training_status" in metric_types_to_fetch:
                try:
                    training_status_data = garmin.get_training_status(current_date)
                    if training_status_data:
                        health_data["training_status"].append({"date": current_date, "training_status": training_status_data.get("status")})
                except Exception as e:
                    logger.warning(f"Could not retrieve training status data for {current_date}: {e}")

            # Max Metrics (VO2 Max)
            if "max_metrics" in metric_types_to_fetch:
                try:
                    max_metrics_data = garmin.get_max_metrics(current_date)
                    logger.info(f"[GARMIN_SYNC] get_max_metrics({current_date}) RAW RESPONSE: {max_metrics_data}")
                    vo2_max_value = None

                    # Try to extract VO2 Max from REST response
                    if max_metrics_data:
                        if isinstance(max_metrics_data, list) and len(max_metrics_data) > 0:
                            # If it's a list, get first item
                            first_item = max_metrics_data[0]
                            vo2_max_value = first_item.get("vo2Max") or first_item.get("vo2MaxValue") or first_item.get("generic", {}).get("vo2MaxPreciseValue")
                            logger.info(f"[GARMIN_SYNC] VO2 Max from list: {vo2_max_value}")
                        elif isinstance(max_metrics_data, dict):
                            vo2_max_value = max_metrics_data.get("vo2Max") or max_metrics_data.get("vo2MaxValue") or max_metrics_data.get("generic", {}).get("vo2MaxPreciseValue")
                            logger.info(f"[GARMIN_SYNC] VO2 Max from dict: {vo2_max_value}")

                    # If REST didn't work, try GraphQL endpoint
                    if not vo2_max_value:
                        try:
                            graphql_query = f'query{{vo2MaxScalar(startDate:"{current_date}", endDate:"{current_date}")}}'
                            graphql_result = garmin.query_garmin_graphql({"query": graphql_query})
                            logger.info(f"[GARMIN_SYNC] VO2 Max GraphQL RAW RESPONSE: {graphql_result}")
                            if graphql_result and isinstance(graphql_result, dict):
                                vo2_data = graphql_result.get("data", {}).get("vo2MaxScalar", [])
                                if vo2_data and len(vo2_data) > 0:
                                    vo2_max_value = vo2_data[0].get("vo2Max") or vo2_data[0].get("value")
                                    logger.info(f"[GARMIN_SYNC] VO2 Max from GraphQL: {vo2_max_value}")
                        except Exception as gql_e:
                            logger.warning(f"GraphQL VO2 Max query failed: {gql_e}")

                    if vo2_max_value:
                        health_data["max_metrics"].append({"date": current_date, "vo2_max": vo2_max_value})
                except Exception as e:
                    logger.warning(f"Could not retrieve max metrics data for {current_date}: {e}")

            # HRV
            if "hrv" in metric_types_to_fetch:
                try:
                    data = {}
                    data["date"] = current_date
                    data["hrvValue"] = []
                    hrv_raw = garmin.get_hrv_data(current_date) or {}
                    logger.info(f"[GARMIN_SYNC] get_hrv_data({current_date}) RAW KEYS: {list(hrv_raw.keys()) if hrv_raw else None}")
                    logger.info(f"[GARMIN_SYNC] get_hrv_data({current_date}) RAW RESPONSE: {hrv_raw}")
                    hrv_list = hrv_raw.get('hrvReadings') or []
                    hrv_values = []
                    for entry in hrv_list:
                        if entry.get('hrvValue'):
                            data["hrvValue"].append({"time": datetime.strptime(entry['readingTimeGMT'], "%Y-%m-%dT%H:%M:%S.%f").replace(tzinfo=timezone.utc).isoformat(), "data": entry.get('hrvValue')})
                            hrv_values.append(entry.get('hrvValue'))

                    # Calculate average overnight HRV for the mapping
                    if hrv_values:
                        data["average_overnight_hrv"] = sum(hrv_values) / len(hrv_values)

                    # Capture additional HRV fields from API if available
                    data["hrv_status"] = hrv_raw.get("hrvStatus") or hrv_raw.get("status")
                    data["weekly_avg"] = hrv_raw.get("weeklyAvg") or hrv_raw.get("sevenDayAvg")
                    data["baseline_low"] = hrv_raw.get("baselineLowUpper") or hrv_raw.get("baselineLow")
                    data["baseline_high"] = hrv_raw.get("baselineBalancedLow") or hrv_raw.get("baselineHigh")

                    # Also check for lastNight and baseline in summary
                    hrv_summary = hrv_raw.get("hrvSummary") or {}
                    if hrv_summary:
                        data["last_night_avg"] = hrv_summary.get("lastNightAvg") or hrv_summary.get("lastNight")
                        data["last_night_5min_high"] = hrv_summary.get("lastNight5MinHigh")
                        data["baseline_balanced_low"] = hrv_summary.get("baselineBalancedLow")
                        data["baseline_balanced_upper"] = hrv_summary.get("baselineBalancedUpper")
                        data["status"] = hrv_summary.get("status")
                        logger.info(f"[GARMIN_SYNC] HRV Summary: lastNight={data.get('last_night_avg')}, baseline={data.get('baseline_balanced_low')}-{data.get('baseline_balanced_upper')}, status={data.get('status')}")

                    health_data["hrv"].append(data)
                except Exception as e:
                    logger.warning(f"Could not retrieve HRV data for {current_date}: {e}")

            # Endurance Score
            if "endurance_score" in metric_types_to_fetch:
                try:
                    endurance_score_data = garmin.get_endurance_score(current_date, current_date)
                    if endurance_score_data:
                        health_data["endurance_score"].append({"date": current_date, "endurance_score": endurance_score_data.get("score")})
                except Exception as e:
                    logger.warning(f"Could not retrieve endurance score data for {current_date}: {e}")

            # Hill Score
            if "hill_score" in metric_types_to_fetch:
                try:
                    hill_score_data = garmin.get_hill_score(current_date, current_date)
                    if hill_score_data:
                        health_data["hill_score"].append({"date": current_date, "hill_score": hill_score_data.get("overall")})
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

            # Body Battery fallback (only if not already fetched from user_summary)
            if "body_battery" in metric_types_to_fetch:
                # Check if we already have body battery data for this date from user_summary
                has_bb_for_date = any(bb.get("date") == current_date for bb in health_data.get("body_battery", []))
                if not has_bb_for_date:
                    try:
                        body_battery_data = garmin.get_body_battery(current_date, current_date)
                        logger.info(f"[GARMIN_SYNC] get_body_battery({current_date}) fallback RAW RESPONSE: {body_battery_data}")
                        if body_battery_data and isinstance(body_battery_data, list) and len(body_battery_data) > 0:
                            for bb_entry in body_battery_data:
                                # Extract from bodyBatteryValuesArray if available
                                bb_values = bb_entry.get("bodyBatteryValuesArray", [])
                                bb_highest = max([v[1] for v in bb_values], default=None) if bb_values else None
                                bb_lowest = min([v[1] for v in bb_values], default=None) if bb_values else None
                                bb_current = bb_values[-1][1] if bb_values else None

                                logger.info(f"[GARMIN_SYNC] Body battery fallback entry: highest={bb_highest}, lowest={bb_lowest}, charged={bb_entry.get('charged')}, drained={bb_entry.get('drained')}")
                                health_data["body_battery"].append({
                                    "date": current_date,
                                    "body_battery_highest": bb_highest,
                                    "body_battery_lowest": bb_lowest,
                                    "body_battery_at_wake": None,  # Not available in this endpoint
                                    "body_battery_charged": bb_entry.get("charged"),
                                    "body_battery_drained": bb_entry.get("drained"),
                                    "body_battery_current": bb_current
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

            # Body Composition (weight, body fat, bone mass, muscle mass)
            if "body_composition" in metric_types_to_fetch:
                try:
                    body_composition_data = garmin.get_body_composition(current_date, current_date)
                    logger.info(f"[GARMIN_SYNC] get_body_composition({current_date}) RAW RESPONSE KEYS: {list(body_composition_data.keys()) if body_composition_data else 'None'}")
                    if body_composition_data and body_composition_data.get("dateWeightList"):
                        for entry in body_composition_data["dateWeightList"]:
                            logger.info(f"[GARMIN_SYNC] Body composition entry ALL KEYS: {list(entry.keys())}")
                            logger.info(f"[GARMIN_SYNC] Body composition entry VALUES: weight={entry.get('weight')}, bodyFat={entry.get('bodyFat')}, boneMass={entry.get('boneMass')}, muscleMass={entry.get('muscleMass')}, bmi={entry.get('bmi')}, bodyWater={entry.get('bodyWater')}")
                            health_data["body_composition"].append({
                                "date": entry.get("date"), # Use the date from the entry itself
                                "weight": safe_convert(entry.get("weight"), grams_to_kg),
                                "body_fat_percentage": entry.get("bodyFat"),
                                "bmi": entry.get("bmi"),
                                "body_water_percentage": entry.get("bodyWater"),
                                "bone_mass": safe_convert(entry.get("boneMass"), grams_to_kg),
                                "muscle_mass": safe_convert(entry.get("muscleMass"), grams_to_kg)
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

        # Log summary of what data was collected
        logger.info(f"[GARMIN_SYNC] ========== SYNC SUMMARY ==========")
        logger.info(f"[GARMIN_SYNC] User: {user_id}, Date range: {start_date} to {end_date}")
        for metric_name, entries in final_health_data.items():
            entry_count = len(entries) if isinstance(entries, list) else 1
            logger.info(f"[GARMIN_SYNC] {metric_name}: {entry_count} entries")
        logger.info(f"[GARMIN_SYNC] ===================================")

        # Save data to local file if GARMIN_DATA_SOURCE is not "local"
        _save_to_local_file(filename, {"user_id": user_id, "start_date": start_date, "end_date": end_date, "data": final_health_data})

        logger.debug(f"Final health data being returned: {final_health_data}")
        logger.info(f"Successfully retrieved and cleaned health and wellness data for user {user_id} from {start_date} to {end_date}.")

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
