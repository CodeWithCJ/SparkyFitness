import os
import json
import logging
import time
from datetime import date, timedelta

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

MOCK_DATA_DIR = "mock_data"
os.makedirs(MOCK_DATA_DIR, exist_ok=True)
IS_CN = bool(os.getenv("GARMIN_SERVICE_IS_CN", "false").lower() == "true")
GARMIN_DATA_SOURCE = os.getenv("SPARKY_FITNESS_GARMIN_DATA_SOURCE", "garmin").lower()
SAVE_MOCK_DATA = os.getenv("SPARKY_FITNESS_SAVE_MOCK_DATA", "false").lower() == "true"

logger.info(f"Garmin data source configured to: {GARMIN_DATA_SOURCE}")
logger.info(f"Garmin mock data saving enabled: {SAVE_MOCK_DATA}")
if IS_CN:
    logger.info("Configured for Garmin China (CN) region.")


ALL_HEALTH_METRICS = [
    # Daily summary metrics
    "steps",
    "total_distance",
    "highly_active_seconds",
    "active_seconds",
    "sedentary_seconds",
    # Health metrics
    "heart_rates",
    "sleep",
    "stress",
    "respiration",
    "spo2",
    "intensity_minutes",
    "training_readiness",
    "training_status",
    "max_metrics",
    "hrv",
    "lactate_threshold",
    "endurance_score",
    "hill_score",
    "race_predictions",
    "blood_pressure",
    "body_battery",
    "menstrual_data",
    "floors",
    "fitness_age",
    "body_composition",
    "hydration",
    "recovery_time",
    "training_load",
    "acute_load",
]

MFA_STATE_STORE: dict[str, dict] = {}
MFA_TTL_SECONDS = 5 * 60  # 5 minutes


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


def _cleanup_mfa_cache():
    now = time.time()
    to_delete = [
        token for token, v in MFA_STATE_STORE.items() if now - v["ts"] > MFA_TTL_SECONDS
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
            if (
                v is not None
                and k
                not in [
                    "ownerId",
                    "userProfilePk",
                    "permissionId",
                    "userRoles",
                    "equipmentTypeId",
                ]
                and "endConditionCompare" not in k
            ):
                cleaned_value = clean_garmin_data(v)
                if cleaned_value is not None:
                    cleaned_dict[k] = cleaned_value
        if not cleaned_dict:
            logger.warning(
                "clean_garmin_data: sub-object dropped because all values were None or excluded (keys were: %s)",
                list(data.keys()),
            )
            return None
        return cleaned_dict
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


def convert_activities_units(activities):
    """Convert units for a list of activities."""
    for activity in activities:
        activity["distance"] = safe_convert(activity.get("distance"), meters_to_km)
        activity["duration"] = safe_convert(
            activity.get("duration"), seconds_to_minutes
        )
        activity["elapsedDuration"] = safe_convert(
            activity.get("elapsedDuration"), seconds_to_minutes
        )
        activity["movingDuration"] = safe_convert(
            activity.get("movingDuration"), seconds_to_minutes
        )
        # Add other activity-level conversions here if needed
    return activities


def convert_user_summary_units(summary):
    """Convert units for the user summary."""
    if summary and "totalWeight" in summary:
        summary["totalWeight"] = safe_convert(summary.get("totalWeight"), grams_to_kg)
    # Add other summary-level conversions here if needed
    return summary


def map_garmin_stress_to_mood(stress_level):
    """
    Maps Garmin stress level (0-100) to SparkyFitness mood value (0-100).
    -1, -2 indicate no data.
    """
    if stress_level is None or stress_level < 0:
        return None, None  # No mood if no valid stress data

    if 0 <= stress_level <= 10:
        return 95, "Excited"  # 91-100
    elif 11 <= stress_level <= 25:
        return 85, "Happy"  # 81-90
    elif 26 <= stress_level <= 35:
        return 75, "Confident"  # 71-80
    elif 36 <= stress_level <= 50:
        return 65, "Calm"  # 61-70
    elif 51 <= stress_level <= 60:
        return 55, "Thoughtful"  # 51-60
    elif 61 <= stress_level <= 75:
        return 45, "Neutral"  # 41-50
    elif 76 <= stress_level <= 85:
        return 35, "Worried"  # 31-40
    elif 86 <= stress_level <= 95:
        return 25, "Angry"  # 21-30
    elif 96 <= stress_level <= 100:
        return 15, "Sad/Tired"  # 10-20
    else:
        return 50, "Neutral"  # Default or unhandled range
