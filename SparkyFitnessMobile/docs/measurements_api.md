### `GET /api/measurements/custom-categories`

Returns all custom categories. 

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

Response:

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

Ordered by `entry_date, entry_timestamp`

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

### `GET /api/measurements/check-in-photos`

Every progress photo the caller can see, newest day first, each with the weight
logged on the same calendar day. Backs the mobile gallery, the side-by-side
comparison and the time-lapse player in a single request; without it each of
those needed one request per day plus a separate measurements-range call to
find the matching weights.

The weight is joined on `(user_id, entry_date)` rather than the stored
`check_in_measurement_id`. That FK is only populated when a measurement row
already existed at upload time, so a photo taken before the day's weight was
entered would otherwise report no weight forever. `check_in_measurements` has a
unique index on `(user_id, entry_date)`, so the join cannot fan out rows.

`weight` is in kilograms as stored, and is null when the day has no check-in
measurement or the measurement carries no weight. `file_path` is deliberately
absent: image bytes come from `/file/{id}` below, so the on-disk layout stays a
server detail.

```json
[
  {
    "id": "uuid",
    "entry_date": "2025-12-01",
    "photo_type": "front",
    "weight": 84.2
  },
  ...
]
```

Ordered by `entry_date DESC, photo_type ASC`. Note that `photo_type` orders
alphabetically (`back`, `front`, `side`), not front/side/back — clients that
care about angle order should impose their own.

The response is not paginated and carries the caller's whole history. Each row
is small (an id, a day string, an angle and a number), so the payload stays
modest even at hundreds of shoots — but it is a list of *photo references*, and
a client that mounts an image per row will decode every photo the user has ever
taken. Fetch the list in one go; window what you render. The mobile comparison
loads exactly the two photos on screen, and the time-lapse mounts one frame
with a small prefetch buffer ahead of it.

### `GET /api/measurements/check-in-photos/dates`

The calendar days (`YYYY-MM-DD`, newest first) that have at least one photo.
Used to mark those days in a date picker without pulling the whole gallery.

```json
["2025-12-01", "2025-11-24", ...]
```

### `GET /api/measurements/check-in-photos/{date}`

The photos taken on one day, including `file_path`.

### `GET /api/measurements/check-in-photos/file/{id}`

The image bytes. Requires auth: the `uploads/check-in` subtree is blocked on the
public static mounts, so a plain URL will not load — mobile attaches the usual
auth and proxy headers (see `useCheckInPhotoSource`).

### `POST /api/measurements/check-in-photos/{date}/{type}`

Multipart upload of field `photo` for one angle (`front`, `back`, `side`),
replacing that slot if it is taken. The server sniffs magic bytes and rejects
anything that is not jpeg/png/gif/webp, so iOS HEIC must be re-encoded first —
mobile's `pickImage` helper already does that.

### `DELETE /api/measurements/check-in-photos/photo/{id}`

Removes one photo. Returns 204.

All of the above require the `checkin` permission. Photo routes are excluded
from the GET → `checkin_read` downgrade in `checkPermissionMiddleware`, so a
family member with only `can_view_reports` gets a 403 here even though they can
read the numeric measurements.
