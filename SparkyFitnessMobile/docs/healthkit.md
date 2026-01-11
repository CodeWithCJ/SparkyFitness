## Exercise Session

1. Raw data from HealthKit (returned by readHealthRecords):
```json
{
  startTime: "2026-01-08T10:00:00.000Z",
  endTime: "2026-01-08T10:45:00.000Z",
  activityType: 37,  // numeric HKWorkoutActivityType
  duration: { unit: 's', quantity: 2700 },
  totalEnergyBurned: 320,  // kcal
  totalDistance: 5200,     // meters
}
```

2. Transformed data sent to server (after transformHealthRecords):

```json
{
  type: 'ExerciseSession',
  source: 'HealthKit',
  date: '2026-01-08',
  entry_date: '2026-01-08',
  timestamp: '2026-01-08T10:00:00.000Z',
  startTime: '2026-01-08T10:00:00.000Z',
  endTime: '2026-01-08T10:45:00.000Z',
  duration: 2700,           // seconds
  activityType: 'Running',  // human-readable name from ACTIVITY_MAP
  title: 'Running',
  caloriesBurned: 320,
  distance: 5200,
  notes: 'Source: HealthKit',
  raw_data: { ... }         // original record
}
```
