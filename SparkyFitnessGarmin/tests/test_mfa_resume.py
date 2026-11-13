import asyncio
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

from fastapi import HTTPException
from garminconnect import (
    GarminConnectAuthenticationError,
    GarminConnectTooManyRequestsError,
)

GARMIN_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(GARMIN_DIR))

import routes
from schemas import GarminLoginRequest

PENDING = {"domain": "garmin.com", "flow": "widget", "cookies": []}


class FakeClient:
    def dumps(self):
        return json.dumps({"di_token": "t"})


class FakeGarmin:
    """Stands in for garminconnect.Garmin; each test sets what it does."""

    instances = []
    login_result = ("needs_mfa", PENDING)
    resume_error = None

    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.client = FakeClient()
        self.calls = []
        FakeGarmin.instances.append(self)

    def login(self):
        self.calls.append(("login",))
        return FakeGarmin.login_result

    def resume_login(self, client_state, mfa_code):
        self.calls.append(("resume_login", client_state, mfa_code))
        if FakeGarmin.resume_error:
            raise FakeGarmin.resume_error
        return None, None


class FakeRequest:
    def __init__(self, body):
        self._body = body

    async def json(self):
        return self._body


def resume(body):
    with mock.patch.object(routes, "logger"):
        return asyncio.run(routes.garmin_resume_login(FakeRequest(body)))


class MfaLoginTests(unittest.TestCase):
    def setUp(self):
        FakeGarmin.instances = []
        FakeGarmin.login_result = ("needs_mfa", PENDING)
        FakeGarmin.resume_error = None
        patcher = mock.patch.object(routes, "Garmin", FakeGarmin)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_login_hands_back_the_pending_sign_in(self):
        with mock.patch.object(routes, "logger"):
            result = asyncio.run(
                routes.garmin_login(
                    GarminLoginRequest(email="e", password="p", user_id="u1")
                )
            )
        self.assertEqual(result, {"status": "needs_mfa", "client_state": PENDING})

    def test_a_fresh_instance_finishes_the_sign_in_from_its_state(self):
        result = resume({"client_state": PENDING, "mfa_code": 123456, "user_id": "u1"})
        self.assertEqual(result, {"status": "success", "tokens": {"di_token": "t"}})
        [garmin] = FakeGarmin.instances
        self.assertEqual(garmin.calls, [("resume_login", PENDING, "123456")])

    def test_a_wrong_code_is_a_401_so_it_is_not_retried(self):
        FakeGarmin.resume_error = GarminConnectAuthenticationError("Widget MFA failed")
        with self.assertRaises(HTTPException) as caught:
            resume({"client_state": PENDING, "mfa_code": "000000", "user_id": "u1"})
        self.assertEqual(caught.exception.status_code, 401)

    def test_a_rate_limit_is_a_429(self):
        FakeGarmin.resume_error = GarminConnectTooManyRequestsError("429")
        with self.assertRaises(HTTPException) as caught:
            resume({"client_state": PENDING, "mfa_code": "123456", "user_id": "u1"})
        self.assertEqual(caught.exception.status_code, 429)

    def test_a_missing_state_is_a_400(self):
        with self.assertRaises(HTTPException) as caught:
            resume({"client_state": "", "mfa_code": "123456", "user_id": "u1"})
        self.assertEqual(caught.exception.status_code, 400)
        self.assertEqual(FakeGarmin.instances, [])


if __name__ == "__main__":
    unittest.main()
