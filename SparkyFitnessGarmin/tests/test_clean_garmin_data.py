import sys
import unittest
from pathlib import Path

GARMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GARMIN_DIR))

from service import clean_garmin_data


class CleanGarminDataTests(unittest.TestCase):
    def test_preserves_none_in_lists_to_maintain_positional_indices(self):
        # Activity detail metrics rely on positional index matching metricDescriptors
        raw_metrics = [
            10,
            1792594585000,
            126.599,
            17,
            100,
            31.85,
            100,
            76,
            36,
            57,
            None,  # e.g. directVerticalSpeed not available
            51.421967,  # directLatitude
            7.028038,  # directLongitude
            2.733,  # directSpeed
        ]
        cleaned = clean_garmin_data(raw_metrics)
        self.assertEqual(len(cleaned), 14)
        self.assertEqual(cleaned[10], None)
        self.assertEqual(cleaned[11], 51.421967)
        self.assertEqual(cleaned[12], 7.028038)
        self.assertEqual(cleaned[13], 2.733)

    def test_removes_none_keys_and_excluded_fields_from_dicts(self):
        raw_dict = {
            "ownerId": 12345,
            "permissionId": "abc",
            "validField": "hello",
            "noneField": None,
            "zeroField": 0,
            "nested": {
                "userProfilePk": 999,
                "keepMe": True,
            },
        }
        cleaned = clean_garmin_data(raw_dict)
        self.assertEqual(
            cleaned,
            {
                "validField": "hello",
                "zeroField": 0,
                "nested": {
                    "keepMe": True,
                },
            },
        )


if __name__ == "__main__":
    unittest.main()
