

### `GET /api/measurements/custom-categories`

Returns all custom categories. You need the `id` for the heart_rate category. Response:

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "category_name": "heart_rate",
    "unit": "bpm",
    "data_type": "numeric",
    "measurement_type": "string or null",
    "created_at": "2025-01-01T00:00:00Z",
    "updated_at": "2025-01-01T00:00:00Z"
  },
  ...
]
```
### `GET /api/measurements/custom-measurements-range/{categoryId}/{startDate}/{endDate}`

Using the heart_rate category UUID from above. Response:

```json
[
  {
    "category_id": "uuid",
    "date": "2025-12-01",
    "hour": 14,
    "value": "72",
    "timestamp": "2025-12-01T14:00:00Z"
  },
  ...
]
```

Ordered by `entry_date, entry_timestamp`. Note that `value` comes back as a string — you'll need to parse it to a number for charting.




### `GET /api/measurements/check-in-measurements-range/{startDate}/{endDate}`

Returns all fields. Takes a date range and returns way too much. Exercise, sleep, nutrition, and everything else.


```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "entry_date": "2025-12-01",
    "weight": 185.5,
    "neck": 15.0,
    "waist": 34.0,
    "hips": 38.0,
    "steps": 8500,
    "updated_at": "2025-12-01T12:00:00Z"
  },
  ...
]
```

Ordered by `entry_date DESC, updated_at DESC`. All columns from `check_in_measurements` are returned (`SELECT *`), 