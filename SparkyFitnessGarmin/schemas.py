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
    data_source: str | None = None
    save_mock_data: bool | None = None


class ActivitiesAndWorkoutsRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    activity_type: str | None = None
    data_source: str | None = None
    save_mock_data: bool | None = None


class NutritionDiaryRequest(BaseModel):
    user_id: str
    tokens: str
    start_date: str
    end_date: str
    data_source: str | None = None
    save_mock_data: bool | None = None
