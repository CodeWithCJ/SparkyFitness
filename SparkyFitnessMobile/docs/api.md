# Sync API for Mobile App

## POST /health-data

### Authentication

- Header: `Authorization: Bearer <api_key>` or `X-API-Key: <api_key>`
- The API key must be active and have `health_data_write` permission

### Request Format

- **Method:** POST
- **Content-Type:** Any (parsed as raw text)
- **Body:** JSON array or single JSON object (also handles concatenated JSON objects `{...}{...}`)

### Supported Data Types

| Type                      | Required Fields                 | Notes                  |
| ------------------------- | ------------------------------- | ---------------------- |
| step / steps              | value (integer), date/timestamp | Daily step count       |
| water                     | value (integer), date/timestamp | Water intake (ml)      |
| Active Calories           | value (number), date/timestamp  | Creates exercise entry |
| weight                    | value (number), date/timestamp  | Body weight            |
| body_fat_percentage       | value (number), date/timestamp  | Body fat %             |
| SleepSession              | timestamp, duration_in_seconds  | Complex sleep data     |
| ExerciseSession / Workout | timestamp, activityType         | Exercise entry         |
| Stress                    | timestamp                       | Optional value         |
| Custom types              | value, date/timestamp           | Auto-creates category  |

### Common Fields

```json
{
  "type": "steps",
  "value": 10000,
  "date": "2024-01-15", // or timestamp
  "timestamp": "2024-01-15T14:30:00Z", // optional, more precise
  "source": "MyApp" // defaults to "manual"
}
```

### SleepSession Example

```json
{
  "type": "SleepSession",
  "timestamp": "2024-01-15T23:00:00Z",
  "source": "HealthKit",
  "duration_in_seconds": 28800,
  "bedtime": "2024-01-15T23:00:00Z",
  "wake_time": "2024-01-16T07:00:00Z",
  "deep_sleep_seconds": 7200,
  "light_sleep_seconds": 14400,
  "rem_sleep_seconds": 5400,
  "awake_sleep_seconds": 1800,
  "stage_events": [...]
}
```

### Workout Example

```json
{
  "type": "Workout",
  "timestamp": "2024-01-15T08:00:00Z",
  "source": "HealthKit",
  "activityType": "Running",
  "duration": 1800,            // seconds
  "caloriesBurned": 350,
  "distance": 5000,            // meters
  "raw_data": {...}            // optional, stored as activity details
}
```

### Response

#### Success (200)

```json
{
  "message": "All health data successfully processed.",
  "processed": [{ "type": "steps", "status": "success", "data": {...} }]
}
```

#### Partial failure (400)

```json
{
  "message": "Some health data entries could not be processed.",
  "processed": [...],
  "errors": [{ "error": "...", "entry": {...} }]
}
```

## GET /auth/user

### Authentication

The authenticate middleware accepts any of these methods:

1. JWT token in cookie (`token`)
2. Session (OIDC-based)
3. API Key via `Authorization: Bearer <api_key>`

### Request

```http
GET /auth/user
Authorization: Bearer <api_key>
```

### Response

#### Success (200)

```json
{
  "userId": 123,
  "email": "user@example.com",
  "role": "user",
  "created_at": "2024-01-15T10:30:00.000Z"
}
```

#### Unauthorized (401)

```json
{
  "error": "Authentication: No token, active session, or valid API key provided."
}
```

#### Not Found (404)

```json
{
  "error": "User not found."
}
```
