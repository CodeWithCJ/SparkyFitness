# API Reference

This document provides comprehensive information about the SparkyFitness API, including OpenAPI specification, endpoints, and integration guidelines.

## OpenAPI Specification

The OpenAPI Specification (OAS) defines a standard, language-agnostic interface to RESTful APIs. It allows both humans and computers to discover and understand the capabilities of a service without access to source code, documentation, or network traffic inspection.

## Purpose in SparkyFitness

For SparkyFitness, an OpenAPI specification would serve several key purposes:

*   **API Documentation**: Provides clear and interactive documentation for all backend API endpoints, including request parameters, response structures, and authentication methods.
*   **Client Code Generation**: Enables automatic generation of client SDKs (Software Development Kits) in various programming languages, simplifying integration for third-party applications or mobile clients.
*   **API Testing**: Facilitates automated testing of API endpoints, ensuring consistency and correctness.
*   **Design and Collaboration**: Serves as a single source of truth for API design, improving collaboration between frontend and backend developers.

## Key Elements of SparkyFitness's API (as described by OpenAPI)

An OpenAPI specification for SparkyFitness would detail:

*   **Endpoints**: All available API routes (e.g., `/api/food`, `/api/users`, `/api/exercises`).
*   **Operations**: HTTP methods supported for each endpoint (GET, POST, PUT, DELETE).
*   **Parameters**: Input parameters for each operation, including their types, formats, and whether they are required.
*   **Responses**: The structure of successful and error responses, including status codes and data models.
*   **Authentication**: How clients authenticate with the API (e.g., JWT tokens).
*   **Data Models (Schemas)**: Definitions of the data structures used in requests and responses (e.g., `FoodItem`, `UserProfile`, `ExerciseEntry`).

## Accessing the API Documentation

While a live, interactive OpenAPI documentation (like Swagger UI) might be available in development environments, the core API is consumed by the SparkyFitness frontend and can be explored by examining the backend routes in `SparkyFitnessServer/routes/` and the service definitions in `SparkyFitnessServer/services/`.

---

## Detailed API Endpoints

### Authentication

*   **API Key**: Used for specific endpoints like `/api/health-data`. The API Key should be sent in the `Authorization` header as `Bearer <API_KEY>` or in the `X-API-Key` header. The API Key must have the necessary permissions (e.g., `health_data_write`).
*   **JWT Token**: Used for most authenticated endpoints. The JWT token should be sent in the `Authorization` header as `Bearer <JWT_TOKEN>`.

### Error Handling

General error responses follow a consistent structure:

*   `400 Bad Request`: Indicates invalid input or missing required fields.
*   `401 Unauthorized`: Occurs when authentication credentials are missing or invalid.
*   `403 Forbidden`: Occurs when the authenticated user does not have the necessary permissions.
*   `404 Not Found`: The requested resource could not be found.
*   `500 Internal Server Error`: An unexpected error occurred on the server.

Example Error Response:
```json
{
  "error": "Error message describing the issue."
}
```

### Endpoints

#### 1. `/api/health-data`

*   **Path**: `/api/health-data`
*   **Method**: `POST`
*   **Description**: Submits various health data points (e.g., weight, steps, active calories, custom measurements) to the system. This endpoint is crucial for integrating SparkyFitness with external health tracking services like iOS Shortcuts and Android mobile apps, allowing seamless data submission.
*   **Authentication**: API Key (sent via `Authorization` header as `Bearer <API_KEY>` or `X-API-Key` header). The API Key must have `health_data_write` permission.
*   **Request Body**: An array of health data objects, or a single health data object.
    *   **Structure**:
        ```json
        [
          {
            "value": <number>,
            "type": "<string>",
            "date": "<YYYY-MM-DD>",
            "timestamp": "<ISO 8601 string, optional>"
          },
          ...
        ]
        ```
    *   **Fields**:
        *   `value` (required, number): The measurement value.
        *   `type` (required, string): The type of health data. This field is case-sensitive. Supported types include:
            *   `weight`: Records body weight.
            *   `step`: Records the number of steps taken.
            *   `water`: Records water intake in milliliters.
            *   `Active Calories`: Records calories burned through physical activity.
            *   Any other string: Will be treated as a custom measurement category. If a category with this name does not exist, it will be automatically created.
        *   `date` (required, string): The date of the measurement in `YYYY-MM-DD` format (e.g., "2025-08-19").
        *   `timestamp` (optional, string): The exact timestamp of the measurement in ISO 8601 format (e.g., "2025-08-19T08:30:00Z"). If provided, the `entryHour` will be extracted for more granular tracking.
    *   **Examples**:
        *   **Weight**:
            ```json
            [
              {
                "value": 70.5,
                "type": "weight",
                "date": "2025-08-19"
              }
            ]
            ```
        *   **Steps**:
            ```json
            [
              {
                "value": 10000,
                "type": "step",
                "date": "2025-08-19"
              }
            ]
            ```
        *   **Water Intake**:
            ```json
            [
              {
                "value": 500,
                "type": "water",
                "date": "2025-08-19"
              }
            ]
            ```
        *   **Active Calories**:
            ```json
            [
              {
                "value": 500,
                "type": "Active Calories",
                "date": "2025-08-19"
              }
            ]
            ```
        *   **Custom Measurement (e.g., "Blood Pressure Systolic")**:
            ```json
            [
              {
                "value": 120,
                "type": "Blood Pressure Systolic",
                "date": "2025-08-19",
                "timestamp": "2025-08-19T08:30:00Z"
              }
            ]
            ```
*   **Workout records (`type: "Workout"` or `"ExerciseSession"`)**: these carry a session object rather than a single `value`, and are written to `exercise_entries` (plus the telemetry tables below).
    *   **Core fields**: `activityType` (string, becomes the exercise name and determines its modality), `startTime`/`endTime` (ISO 8601), `duration` (seconds), `caloriesBurned`, `distance` (**kilometres**), `source`, `source_id` (required for deduplication), `sets[]`, `raw_data`.
    *   **`X-Workout-Model-Version` header**: `2` or higher means set durations are in seconds; when absent they are read as minutes. `3` additionally signals that the optional wearable-telemetry objects below may be present. All telemetry fields are optional, so a client that omits them behaves exactly as before.
    *   **`telemetry`** (object, optional): whole-session summary values. Keys are the `exercise_entries` column names and unknown keys are ignored. Commonly: `avg_heart_rate`, `max_heart_rate`, `avg_speed_mps`, `max_speed_mps`, `avg_cadence`, `max_cadence`, `avg_power_watts`, `max_power_watts`, `elevation_gain_meters`, `elevation_loss_meters`, `min_elevation_meters`, `max_elevation_meters`, `floors_climbed`, `stroke_count`, `moving_time_seconds`, `elapsed_time_seconds`, `active_calories`, `ground_contact_time_ms`, `vertical_oscillation_mm`, `stride_length_cm`. Any value the client omits is derived from the series below where possible; values the client does send are never overwritten.
    *   **`gps_points[]`** (optional): the GPS track, written to `exercise_entry_gps_points`. Each point is `{ "t": ISO 8601, "lat": number, "lon": number }` plus optional `alt` (m), `speed` (m/s), `hr` (bpm), `cad`, `power` (W), `dist` (cumulative **metres**), `hacc`/`vacc` (m), `course` (degrees). Points missing `t`, `lat` or `lon` are dropped.
    *   **`hr_samples[]`** (optional): the heart-rate series as `{ "t": ISO 8601, "bpm": number }`. Written to `health_metric_samples` under metric `heart_rate`, linked to the workout, and merged into the day's existing samples rather than replacing them. Send this in addition to any `hr` on `gps_points` so indoor workouts without GPS still produce a chart.
    *   **`laps[]`** (optional): lap windows as `{ "lap_index": number, "start_time": ISO 8601, "end_time": ISO 8601 }`, written to `exercise_entry_laps`. Send only the windows; per-lap distance, heart rate, speed, cadence, power and elevation are computed server-side from the series.
    *   **Heart-rate zones** are always derived server-side from the heart-rate series (using max HR estimated from the profile date of birth) and written to `exercise_entry_hr_zones`. There is no field to supply them directly.
    *   Clients should downsample before uploading. The reverse proxy caps request bodies at 10 MB; roughly 2000 GPS points and 1200 heart-rate samples per workout keeps a session near 250 KB.
    *   **Example**:
        ```json
        [
          {
            "type": "ExerciseSession",
            "source": "HealthKit",
            "source_id": "9C84D9E1-0000-0000-0000-0000000000A1",
            "date": "2025-08-19",
            "startTime": "2025-08-19T09:00:00Z",
            "endTime": "2025-08-19T09:30:00Z",
            "duration": 1800,
            "activityType": "Outdoor Walk",
            "caloriesBurned": 150,
            "distance": 2.4,
            "telemetry": {
              "avg_heart_rate": 112,
              "max_heart_rate": 138,
              "elevation_gain_meters": 24
            },
            "gps_points": [
              { "t": "2025-08-19T09:00:00Z", "lat": 37.7749, "lon": -122.4194, "alt": 10.2, "speed": 1.31, "hr": 105 }
            ],
            "hr_samples": [
              { "t": "2025-08-19T09:00:00Z", "bpm": 105 }
            ],
            "laps": [
              { "lap_index": 1, "start_time": "2025-08-19T09:00:00Z", "end_time": "2025-08-19T09:15:00Z" }
            ]
          }
        ]
        ```
*   **Responses**:
    *   `200 OK`: returned whenever the request body itself is well-formed, even if some individual records could not be processed. Per-record outcomes are reported in the body: `processed` lists successful records, `errors` lists rejected records with their reasons, and `skipped` lists records that were intentionally not written (e.g. Nutrition records without a `source_id`, which cannot be deduplicated). `errors` and `skipped` are always present, possibly empty. A 200 with a non-empty `errors` array means the remaining records were still saved.
        ```json
        {
          "message": "All health data successfully processed.",
          "processed": [
            {
              "type": "weight",
              "status": "success",
              "data": { "id": "uuid", "user_id": "uuid", "entry_date": "2025-08-19", "weight": 70.5 }
            }
          ],
          "errors": [],
          "skipped": []
        }
        ```
        Partial failure example (still `200 OK`):
        ```json
        {
          "message": "Some health data entries could not be processed.",
          "processed": [
            {
              "type": "weight",
              "status": "success",
              "data": { "id": "uuid", "user_id": "uuid", "entry_date": "2025-08-19", "weight": 70.5 }
            }
          ],
          "errors": [
            {
              "error": "Missing required fields: value (for scalar types), type, or date/timestamp in one of the entries",
              "entry": { "value": null, "type": "step", "date": "2025-08-19" }
            }
          ],
          "skipped": []
        }
        ```
        > **Breaking change note (v0.18+)**: earlier server versions returned `400 Bad Request` with the `{ "message", "processed", "errors" }` body when *any* record in the batch failed. Automations that keyed on the 400 status to detect partial failures should instead inspect the `errors` array of the 200 response.
    *   `400 Bad Request`: returned only for malformed request bodies (invalid JSON, or an array containing entries that are not non-null objects).
        ```json
        {
          "error": "Invalid JSON array format."
        }
        ```
        or
        ```json
        {
          "error": "Invalid health data format. All entries must be non-null objects."
        }
        ```
    *   `401 Unauthorized`:
        ```json
        {
          "error": "Unauthorized: Missing API Key"
        }
        ```
        or
        ```json
        {
          "error": "Unauthorized: Invalid or inactive API Key"
        }
        ```
    *   `403 Forbidden`:
        ```json
        {
          "error": "Forbidden: API Key does not have health_data_write permission"
        }
        ```

#### 2. `/api/measurements/check-in`

*   **Path**: `/api/measurements/check-in`
*   **Method**: `POST`
*   **Description**: Upserts (inserts or updates) daily check-in measurements for the authenticated user. Only one check-in entry is allowed per day.
*   **Authentication**: JWT Token (sent via `Authorization` header as `Bearer <JWT_TOKEN>`).
*   **Request Body**:
    *   **Structure**:
        ```json
        {
          "entry_date": "<YYYY-MM-DD>",
          "weight": <number, optional>,
          "height": <number, optional>,
          "body_fat_percentage": <number, optional>,
          "neck": <number, optional>,
          "waist": <number, optional>,
          "hips": <number, optional>,
          "steps": <number, optional>,
          "muscle_mass_kg": <number, optional>,
          "bone_mass_kg": <number, optional>,
          "body_water_percentage": <number, optional>,
          "bmr": <number, optional>
        }
        ```
    *   **Fields**:
        *   `entry_date` (required, string): The date of the check-in in `YYYY-MM-DD` format.
        *   Other fields (optional, number): Measurement values. Masses are in kilograms, circumferences and height in centimetres, `bmr` in kcal (enforced range 300–10,000 kcal), and `body_fat_percentage` / `body_water_percentage` are percentages.
        *   BMI is not accepted or stored — it is derived from weight and height where it is displayed.
        *   Sending `null` for a field clears a previously recorded value for that day.
*   **Responses**:
    *   `200 OK`:
        ```json
        {
          "message": "Check-in measurements upserted successfully.",
          "data": { "id": "uuid", "user_id": "uuid", "entry_date": "2025-08-19", "weight": 70.5 }
        }
        ```
    *   `400 Bad Request`:
        ```json
        {
          "error": "Entry date is required."
        }
        ```
    *   `401 Unauthorized`: (If JWT is missing or invalid)
    *   `403 Forbidden`: (If user is not authorized)

*   **Path**: `/api/measurements/check-in/:date`
*   **Method**: `GET`
*   **Description**: Retrieves daily check-in measurements for a specific date for the authenticated user.
*   **Authentication**: JWT Token.
*   **Path Parameters**:
    *   `date` (required, string): The date of the check-in in `YYYY-MM-DD` format.
*   **Responses**:
    *   `200 OK`:
        ```json
        {
          "id": "uuid",
          "user_id": "uuid",
          "entry_date": "2025-08-19",
          "weight": 70.5,
          "body_fat_percentage": 15.2,
          "muscle_mass_kg": 34.2,
          "bone_mass_kg": 3.1,
          "body_water_percentage": 55.4
        }
        ```
        or `{}` if no entry found for the date.
    *   `400 Bad Request`:
        ```json
        {
          "error": "Date is required."
        }
        ```
    *   `401 Unauthorized`:
    *   `403 Forbidden`:

*   **Path**: `/api/measurements/check-in/:entry_date`
*   **Method**: `PUT`
*   **Description**: Updates an existing daily check-in measurement entry for a specific date.
*   **Authentication**: JWT Token.
*   **Path Parameters**:
    *   `entry_date` (required, string): The date of the check-in in `YYYY-MM-DD` format.
*   **Request Body**:
    *   **Structure**: Same as POST request for `/api/measurements/check-in`, but `entry_date` is provided in the path.
    *   **Fields**: Any of the optional measurement fields (e.g., `weight`, `body_fat_percentage`, `muscle_mass_kg`, `bone_mass_kg`, `body_water_percentage`, `neck`, etc.) to update.
*   **Responses**:
    *   `200 OK`:
        ```json
        {
          "id": "uuid",
          "user_id": "uuid",
          "entry_date": "2025-08-19",
          "weight": 71.0,
          "body_fat_percentage": 15.2,
          "muscle_mass_kg": 34.2,
          "bone_mass_kg": 3.1,
          "body_water_percentage": 55.4
        }
        ```
    *   `400 Bad Request`:
        ```json
        {
          "error": "Entry date is required."
        }
        ```
    *   `401 Unauthorized`: (If JWT is missing or invalid)
    *   `403 Forbidden`: (If user is not authorized)
    *   `404 Not Found`:
        ```json
        {
          "error": "Check-in measurement not found or not authorized to update."
        }
        ```

*   **Path**: `/api/measurements/check-in/:id`
*   **Method**: `DELETE`
*   **Description**: Deletes a daily check-in measurement entry.
*   **Authentication**: JWT Token.
*   **Path Parameters**:
    *   `id` (required, string): The ID of the check-in entry to delete.
*   **Responses**:
    *   `200 OK`:
        ```json
        {
          "message": "Check-in measurement deleted successfully."
        }
        ```
    *   `400 Bad Request`:
        ```json
        {
          "error": "Check-in Measurement ID is required."
        }
        ```
    *   `401 Unauthorized`:
    *   `403 Forbidden`:
    *   `404 Not Found`:
        ```json
        {
          "error": "Check-in measurement not found or not authorized to delete."
        }
        ```

#### 3. `/api/measurements/check-in-photos`

Progress photos attached to a calendar day. Every route below requires the `checkin` permission; they are deliberately excluded from the `GET` → `checkin_read` downgrade applied to the rest of the measurements routes, so a family member with read-only access to the numbers still gets a `403` on the photos.

*   **Path**: `/api/measurements/check-in-photos`
*   **Method**: `GET`
*   **Description**: Every photo the caller has, newest day first, each paired with the weight logged on the same calendar day. Backs the mobile gallery, side-by-side comparison and time-lapse in one request. The weight is joined on `(user_id, entry_date)` rather than the stored `check_in_measurement_id`, so a photo taken before that day's weight was entered still reports it.
*   **Authentication**: JWT Token.
*   **Responses**:
    *   `200 OK`: ordered by `entry_date DESC, photo_type ASC`. `weight` is in kilograms and is `null` when the day has no check-in measurement or that measurement carries no weight. `file_path` is omitted on purpose — image bytes come from `/file/{id}`, so the on-disk layout stays a server detail.
        ```json
        [
          { "id": "uuid", "entry_date": "2026-06-14", "photo_type": "front", "weight": 82.5 },
          { "id": "uuid", "entry_date": "2026-06-10", "photo_type": "side", "weight": null }
        ]
        ```
    *   `401 Unauthorized`:
    *   `403 Forbidden`:

*   **Path**: `/api/measurements/check-in-photos/dates`
*   **Method**: `GET`
*   **Description**: The calendar days that have at least one photo, so a date picker can mark them without pulling the whole gallery.
*   **Authentication**: JWT Token.
*   **Responses**:
    *   `200 OK`:
        ```json
        ["2026-06-14", "2026-06-10"]
        ```

*   **Path**: `/api/measurements/check-in-photos/:date`
*   **Method**: `GET`
*   **Description**: The photos taken on one day, including `file_path`.
*   **Authentication**: JWT Token.
*   **Path Parameters**:
    *   `date` (required, string): `YYYY-MM-DD`.

*   **Path**: `/api/measurements/check-in-photos/file/:id`
*   **Method**: `GET`
*   **Description**: The image bytes for one photo. The `uploads/check-in` subtree is blocked on the public static mounts, so this authenticated route is the only way to read a photo.
*   **Authentication**: JWT Token.

*   **Path**: `/api/measurements/check-in-photos/:date/:type`
*   **Method**: `POST`
*   **Description**: Multipart upload of the field `photo` for one angle, replacing that angle if it is already taken. The server sniffs magic bytes and rejects anything that is not jpeg/png/gif/webp, so HEIC must be re-encoded by the client first.
*   **Authentication**: JWT Token.
*   **Path Parameters**:
    *   `date` (required, string): `YYYY-MM-DD`.
    *   `type` (required, string): one of `front`, `back`, `side`.
*   **Responses**:
    *   `200 OK`: the stored photo row, including `file_path`.
    *   `400 Bad Request`: no file provided, or a file whose bytes are not an accepted image.

*   **Path**: `/api/measurements/check-in-photos/photo/:id`
*   **Method**: `DELETE`
*   **Description**: Removes one photo.
*   **Authentication**: JWT Token.
*   **Responses**:
    *   `204 No Content`:
