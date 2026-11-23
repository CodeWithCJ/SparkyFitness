# Hevy

## Automatic sync

When adding or editing a Hevy provider, choose **Manual**, **Hourly**, or **Daily at 21:00** under **Sync Frequency**. New connections default to **Manual**, and existing manual connections stay manual until you change the setting. Keep the provider active to enable automatic sync.

**Daily at 21:00** uses the timezone saved in your SparkyFitness preferences. The server checks hourly and runs the sync at or after 21:00, once per local evening. If an evening attempt fails, a later hourly check can retry before midnight. Only a successful live sync at or after 21:00 whose date range includes the current local day, including a manual sync, counts for that evening. A sync earlier in the day or limited to other dates does not replace the evening run, so today's workouts can still be imported. The server must be running during the evening; missed days are not automatically caught up after midnight.

**Hourly** keeps the existing hourly schedule. You can still use **Sync** manually with any frequency.

Hevy exercise templates also supply the primary and secondary muscle groups used in exercise reports. The importer matches templates by their Hevy ID and fills missing muscle information on your Hevy exercises while preserving populated fields. To add muscle information to workouts imported by an older version, run a full-history sync once so their existing diary snapshots receive the exercise metadata.

Muscle metadata is best effort: if Hevy's template catalogue or a muscle update is unavailable, the workouts still import. Later syncs can fill missing muscles. The catalogue is skipped when all referenced Hevy exercises already have primary muscles, and unchanged library rows are not rewritten. An existing exercise of your own with the same name can be reused without changing its source or muscle fields; global public exercises and other users' exercises are not reused by this importer.

### Link a Hevy workout to its health recording

Hevy supplies exercises and sets, while a matching Health Connect or Apple Health recording can supply measured calories. In the web diary or the mobile workout details, open **Link a synced workout**, select the recording, and choose which calories count. A Hevy workout with no calorie estimate initially selects the synced recording's calories. You can choose another total or unlink at any time.

Both entries and their original estimates remain available. The link controls their contribution to the daily calorie total; it does not copy heart-rate samples or zones between entries. Matching suggestions help you choose, and linking always requires your confirmation.

Repeated Hevy syncs update the existing session and exercise entries instead of deleting a date range. Their IDs, calorie links, and your calorie, heart-rate, distance, duration, note and set corrections survive, as do edited session names and descriptions. Older Hevy sessions are adopted on their next sync. Sets follow the latest Hevy workout until you change them in SparkyFitness; saving unchanged sets does not stop later provider updates. Editing set distances also preserves the entry's derived total distance; an explicitly supplied total still takes precedence. A failed workout write rolls back that workout's diary changes. After a complete live sync, Hevy workouts missing from the fetched date range are removed locally, while workouts outside that range are retained. A saved diagnostic replay does not remove absent workouts. Exercises removed from an included workout are removed from that session; when none remain, the empty session is removed too. Removing a linked workout clears its calorie link and the separate health recording counts its own calories again.

Exercises are matched by their Hevy template rather than their position, so moving a different exercise earlier in the workout does not transfer its corrections. Distinguishable repeated exercises keep their identity through their previous Hevy details. Otherwise occurrences are matched in order. If changed or removed occurrences, or an older replay without template IDs, cannot be identified safely, that workout's import fails and its stored data stays intact.

Deleting a library exercise while keeping its diary history also preserves Hevy entries, their historical exercise metadata and their corrections on the next sync, including older replay data without template IDs. These diary snapshots stay independent of replacement library entries. Empty legacy sessions left after adopting their entries are removed only when they hold no other diary data or custom annotations. A corrected workout duration stays allocated to its exercise when the order changes, including when a timed exercise moves first.

Re-sent Health Connect and Apple Health recordings update in place and keep their calorie links. A recording absent from the next same-day health import is removed, its link is cleared, and the remaining workout counts its own calories again.

#### Recover from an ambiguous Hevy match

Removing one of two identical exercise blocks in Hevy can make it impossible to identify which local occurrence remains. SparkyFitness keeps the stored workout and reports a failed sync with the affected workout title and date so corrections are not transferred to the wrong exercise. Retrying the same data will keep failing. To replace the affected local workout with Hevy's current version:

1. Record any SparkyFitness-only corrections you want to keep, including notes and edited sets.
2. Delete the affected imported Hevy workout from the SparkyFitness diary.
3. Run Hevy sync again for a date range that includes that workout, or use a full-history sync.
4. Reapply your local corrections and use **Link a synced workout** to restore the Health Connect or Apple Health calorie link.

Deleting the local workout removes its corrections and calorie link. It does not delete the workout in Hevy or the separate health recording; that recording counts its own calories until you link the imported workout again. Other stored workouts are unaffected.
