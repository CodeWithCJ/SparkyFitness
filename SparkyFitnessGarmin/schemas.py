from pydantic import BaseModel


class GarminLoginRequest(BaseModel):
    email: str
    password: str
    user_id: str


class HealthAndWellnessRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    metric_types: list[str] = []


class ActivitiesAndWorkoutsRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    activity_type: str | None = None
