import sys
import unittest
from pathlib import Path

GARMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GARMIN_DIR))

from service import (
    ALL_HEALTH_METRICS,
    extract_daily_calories,
    project_daily_calorie_metrics,
)


class ExtractDailyCaloriesTests(unittest.TestCase):
    def test_extracts_canonical_garmin_daily_calorie_fields(self):
        summary = {
            "activeKilocalories": 2180,
            "bmrKilocalories": 2414,
            "totalKilocalories": 4594,
        }

        self.assertEqual(
            extract_daily_calories(summary),
            {
                "active_calories": 2180.0,
                "bmr_calories": 2414.0,
                "total_calories": 4594.0,
            },
        )

    def test_uses_known_fallback_aliases(self):
        summary = {
            "activeCalories": "540",
            "bmrCalories": "1800",
            "totalCalories": "2340",
        }

        self.assertEqual(
            extract_daily_calories(summary),
            {
                "active_calories": 540.0,
                "bmr_calories": 1800.0,
                "total_calories": 2340.0,
            },
        )

    def test_preserves_zero_and_omits_missing_or_invalid_values(self):
        summary = {
            "activeKilocalories": 0,
            "bmrKilocalories": None,
            "bmrCalories": float("inf"),
            "totalKilocalories": "not-a-number",
        }

        self.assertEqual(extract_daily_calories(summary), {"active_calories": 0.0})


class ProjectDailyCalorieMetricsTests(unittest.TestCase):
    def test_daily_calorie_metrics_are_enabled_by_default(self):
        self.assertTrue(
            {"active_calories", "bmr_calories", "total_calories"}.issubset(
                ALL_HEALTH_METRICS
            )
        )

    def test_projects_only_requested_available_metrics(self):
        summary = {
            "activeKilocalories": 2180,
            "bmrKilocalories": 2414,
            "totalKilocalories": 4594,
        }

        self.assertEqual(
            project_daily_calorie_metrics(
                summary,
                "2026-08-02",
                {"active_calories", "total_calories"},
            ),
            {
                "active_calories": [{"date": "2026-08-02", "value": 2180.0}],
                "total_calories": [{"date": "2026-08-02", "value": 4594.0}],
            },
        )

    def test_omits_requested_metric_when_garmin_did_not_return_it(self):
        self.assertEqual(
            project_daily_calorie_metrics(
                {"activeKilocalories": 300},
                "2026-08-02",
                {"bmr_calories"},
            ),
            {},
        )


if __name__ == "__main__":
    unittest.main()
