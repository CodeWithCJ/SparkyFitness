import sys
import unittest
from pathlib import Path

GARMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GARMIN_DIR))

from service import project_body_battery_fallback


class ProjectBodyBatteryFallbackTests(unittest.TestCase):
    def test_ignores_all_none_body_battery_slots_and_skips_empty_record(self):
        payload = [
            {
                "date": "2026-11-22",
                "charged": None,
                "drained": None,
                "bodyBatteryValuesArray": [
                    [1795305600001, None],
                    [1795305600002, None],
                    [1795305600003, None],
                ],
            }
        ]

        self.assertEqual(project_body_battery_fallback(payload, "2026-11-22"), [])

    def test_filters_none_slots_and_tracks_last_valid_reading(self):
        payload = [
            {
                "date": "2026-11-22",
                "charged": 42,
                "drained": 18,
                "bodyBatteryValuesArray": [
                    [1795305600001, None],
                    [1795305600002, 45],
                    [1795305600003, None],
                    [1795305600004, 82],
                    [1795305600005, None],
                ],
            }
        ]

        self.assertEqual(
            project_body_battery_fallback(payload, "2026-11-22"),
            [
                {
                    "date": "2026-11-22",
                    "body_battery_highest": 82,
                    "body_battery_lowest": 45,
                    "body_battery_at_wake": None,
                    "body_battery_charged": 42,
                    "body_battery_drained": 18,
                    "body_battery_current": 82,
                }
            ],
        )

    def test_preserves_zero_readings_and_skips_malformed_slots(self):
        payload = [
            {
                "charged": None,
                "drained": None,
                "bodyBatteryValuesArray": [
                    [1795305600001],
                    "bad",
                    [1795305600002, True],
                    [1795305600003, float("inf")],
                    [1795305600004, 0],
                ],
            }
        ]

        self.assertEqual(
            project_body_battery_fallback(payload, "2026-11-22"),
            [
                {
                    "date": "2026-11-22",
                    "body_battery_highest": 0,
                    "body_battery_lowest": 0,
                    "body_battery_at_wake": None,
                    "body_battery_charged": None,
                    "body_battery_drained": None,
                    "body_battery_current": 0,
                }
            ],
        )

    def test_keeps_charged_or_drained_when_values_array_is_missing_or_none(self):
        payload = [
            {
                "charged": 30,
                "drained": 15,
                "bodyBatteryValuesArray": None,
            }
        ]

        self.assertEqual(
            project_body_battery_fallback(payload, "2026-11-22"),
            [
                {
                    "date": "2026-11-22",
                    "body_battery_highest": None,
                    "body_battery_lowest": None,
                    "body_battery_at_wake": None,
                    "body_battery_charged": 30,
                    "body_battery_drained": 15,
                    "body_battery_current": None,
                }
            ],
        )

    def test_handles_non_list_response_or_non_dict_entries(self):
        self.assertEqual(project_body_battery_fallback(None, "2026-11-22"), [])
        self.assertEqual(
            project_body_battery_fallback(["unexpected"], "2026-11-22"), []
        )


if __name__ == "__main__":
    unittest.main()
