import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';

async function upsertSleepEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepEntryData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const {
      id, // Optional: if provided, attempt to update
      entry_date,
      bedtime,
      wake_time,
      duration_in_seconds,
      time_asleep_in_seconds,
      sleep_score,
      source,
      deep_sleep_seconds,
      light_sleep_seconds,
      rem_sleep_seconds,
      awake_sleep_seconds,
      average_spo2_value,
      lowest_spo2_value,
      highest_spo2_value,
      average_respiration_value,
      lowest_respiration_value,
      highest_respiration_value,
      awake_count,
      avg_sleep_stress,
      restless_moments_count,
      avg_overnight_hrv,
      body_battery_change,
      resting_heart_rate,
    } = sleepEntryData;
    let sleepEntryId = id;
    // If no ID is provided, check for an existing entry for this user, date, and source to prevent duplicates
    if (!sleepEntryId) {
      const existingCheck = await client.query(
        'SELECT id FROM sleep_entries WHERE user_id = $1 AND entry_date = $2 AND source = $3',
        [userId, entry_date, source]
      );
      if (existingCheck.rows.length > 0) {
        sleepEntryId = existingCheck.rows[0].id;
        log(
          'info',
          `Found existing sleep entry ${sleepEntryId} for user ${userId} on ${entry_date} from source ${source}. Switching to update.`
        );
      }
    }
    if (sleepEntryId) {
      // Attempt to update existing entry
      const updateQuery = `
                UPDATE sleep_entries
                SET
                    entry_date = $3,
                    bedtime = $4,
                    wake_time = $5,
                    duration_in_seconds = $6,
                    time_asleep_in_seconds = $7,
                    sleep_score = $8,
                    source = $9,
                    deep_sleep_seconds = $10,
                    light_sleep_seconds = $11,
                    rem_sleep_seconds = $12,
                    awake_sleep_seconds = $13,
                    average_spo2_value = $14,
                    lowest_spo2_value = $15,
                    highest_spo2_value = $16,
                    average_respiration_value = $17,
                    lowest_respiration_value = $18,
                    highest_respiration_value = $19,
                    awake_count = $20,
                    avg_sleep_stress = $21,
                    restless_moments_count = $22,
                    avg_overnight_hrv = $23,
                    body_battery_change = $24,
                    resting_heart_rate = $25,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = $2
                RETURNING id;
            `;
      const updateResult = await client.query(updateQuery, [
        sleepEntryId,
        userId,
        entry_date,
        bedtime,
        wake_time,
        duration_in_seconds,
        time_asleep_in_seconds,
        sleep_score,
        source,
        deep_sleep_seconds,
        light_sleep_seconds,
        rem_sleep_seconds,
        awake_sleep_seconds,
        average_spo2_value,
        lowest_spo2_value,
        highest_spo2_value,
        average_respiration_value,
        lowest_respiration_value,
        highest_respiration_value,
        awake_count,
        avg_sleep_stress,
        restless_moments_count,
        avg_overnight_hrv,
        body_battery_change,
        resting_heart_rate,
      ]);
      if (updateResult.rows.length > 0) {
        sleepEntryId = updateResult.rows[0].id;
        log('info', `Updated sleep entry ${sleepEntryId} for user ${userId}.`);
      } else {
        // If it was supposed to update but the ID (from param) didn't exist for this user,
        // we fall back to insert if id was explicitly provided but not found.
        // But in our case of sync, if we found it via existingCheck, it WILL update.
        throw new Error(`Failed to update sleep entry ${sleepEntryId}.`);
      }
    } else {
      // Insert new entry
      const insertQuery = `
                INSERT INTO sleep_entries (user_id, entry_date, bedtime, wake_time, duration_in_seconds, time_asleep_in_seconds, sleep_score, source, deep_sleep_seconds, light_sleep_seconds, rem_sleep_seconds, awake_sleep_seconds, average_spo2_value, lowest_spo2_value, highest_spo2_value, average_respiration_value, lowest_respiration_value, highest_respiration_value, awake_count, avg_sleep_stress, restless_moments_count, avg_overnight_hrv, body_battery_change, resting_heart_rate)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
                RETURNING id;
            `;
      const insertResult = await client.query(insertQuery, [
        userId,
        entry_date,
        bedtime,
        wake_time,
        duration_in_seconds,
        time_asleep_in_seconds,
        sleep_score,
        source,
        deep_sleep_seconds,
        light_sleep_seconds,
        rem_sleep_seconds,
        awake_sleep_seconds,
        average_spo2_value,
        lowest_spo2_value,
        highest_spo2_value,
        average_respiration_value,
        lowest_respiration_value,
        highest_respiration_value,
        awake_count,
        avg_sleep_stress,
        restless_moments_count,
        avg_overnight_hrv,
        body_battery_change,
        resting_heart_rate,
      ]);
      sleepEntryId = insertResult.rows[0].id;
      log(
        'info',
        `Inserted new sleep entry ${sleepEntryId} for user ${userId}.`
      );
    }
    await client.query('COMMIT');
    return { id: sleepEntryId, ...sleepEntryData };
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', `Error upserting sleep entry for user ${userId}: `, error);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeSleepStageEventData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepStageEventData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any
) {
  const normalized = { ...sleepStageEventData };
  const { stage_type, start_time, duration_in_seconds } = normalized;
  let { end_time } = normalized;
  if (!end_time && start_time && duration_in_seconds) {
    const start = new Date(start_time);
    end_time = new Date(
      start.getTime() + duration_in_seconds * 1000
    ).toISOString();
    log(
      'info',
      `[sleepRepository] Derived missing end_time (${end_time}) for stage ${stage_type} at ${start_time} for user ${userId}`
    );
  }
  normalized.end_time = end_time;
  return normalized;
}

async function upsertSleepStageEventWithClient(
  client: Awaited<ReturnType<typeof getClient>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepStageEventData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any = null
) {
  const normalized = normalizeSleepStageEventData(sleepStageEventData, userId);
  const { id, stage_type, start_time, end_time, duration_in_seconds } =
    normalized;
  let sleepStageEventId;
  const isUUID =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      id
    );
  const upsertByNaturalKey = `
    INSERT INTO sleep_entry_stages
      (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds, created_by_user_id, updated_by_user_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    ON CONFLICT (entry_id, start_time, end_time) DO UPDATE SET
      stage_type = EXCLUDED.stage_type,
      duration_in_seconds = EXCLUDED.duration_in_seconds,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id;
  `;
  if (id && isUUID) {
    const updateQuery = `
      UPDATE sleep_entry_stages
      SET stage_type = $4,
          start_time = $5,
          end_time = $6,
          duration_in_seconds = $7,
          updated_by_user_id = $8,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND entry_id = $2 AND user_id = $3
      RETURNING id;
    `;
    const updateResult = await client.query(updateQuery, [
      id,
      entryId,
      userId,
      stage_type,
      start_time,
      end_time,
      duration_in_seconds,
      actingUserId,
    ]);
    if (updateResult.rows.length > 0) {
      sleepStageEventId = updateResult.rows[0].id;
      log(
        'info',
        `Updated sleep stage event ${sleepStageEventId} for entry ${entryId}.`
      );
    } else {
      const insertResult = await client.query(upsertByNaturalKey, [
        entryId,
        userId,
        stage_type,
        start_time,
        end_time,
        duration_in_seconds,
        actingUserId,
      ]);
      sleepStageEventId = insertResult.rows[0].id;
      log(
        'info',
        `Upserted sleep stage event ${sleepStageEventId} for entry ${entryId} (id ${id} not found).`
      );
    }
  } else {
    const insertResult = await client.query(upsertByNaturalKey, [
      entryId,
      userId,
      stage_type,
      start_time,
      end_time,
      duration_in_seconds,
      actingUserId,
    ]);
    sleepStageEventId = insertResult.rows[0].id;
    const reason =
      id === undefined ? 'no ID provided' : `ignoring invalid ID: ${id}`;
    log(
      'info',
      `Upserted sleep stage event ${sleepStageEventId} for entry ${entryId} (${reason}).`
    );
  }
  const { id: _originalId, ...restOfData } = normalized;
  return { id: sleepStageEventId, ...restOfData };
}

async function upsertSleepStageEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepStageEventData: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any = null
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const result = await upsertSleepStageEventWithClient(
      client,
      userId,
      entryId,
      sleepStageEventData,
      actingUserId
    );
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error upserting sleep stage event for entry ${entryId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function deleteSupersededSleepStagesWithClient(
  client: Awaited<ReturnType<typeof getClient>>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windowStart: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  windowEnd: any,
  keptStages: Array<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    start_time: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    end_time: any;
  }>
) {
  const keptStarts = keptStages.map((s) =>
    s.start_time instanceof Date
      ? s.start_time.toISOString()
      : new Date(s.start_time).toISOString()
  );
  const keptEnds = keptStages.map((s) =>
    s.end_time instanceof Date
      ? s.end_time.toISOString()
      : new Date(s.end_time).toISOString()
  );
  const result = await client.query(
    `DELETE FROM sleep_entry_stages s
     WHERE s.entry_id = $1
       AND s.user_id = $2
       AND s.start_time >= $3
       AND s.end_time   <= $4
       AND NOT EXISTS (
         SELECT 1 FROM unnest($5::timestamptz[], $6::timestamptz[]) AS kept(st, et)
         WHERE kept.st = s.start_time AND kept.et = s.end_time
       )
     RETURNING id`,
    [entryId, userId, windowStart, windowEnd, keptStarts, keptEnds]
  );
  if (result.rows.length > 0) {
    log(
      'info',
      `Deleted ${result.rows.length} superseded sleep stage events for entry ${entryId} (re-sync refined boundaries).`
    );
  }
  return { deleted: result.rows.length };
}

async function mergeSleepStageEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sleepStageEvents: any[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any = null
) {
  // Guard at the module boundary: an empty payload window would collapse to
  // Math.min(...[]) = Infinity → Invalid Date → confusing SQL failure.
  if (!Array.isArray(sleepStageEvents) || sleepStageEvents.length === 0) {
    return [];
  }
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const normalizedEvents = sleepStageEvents.map((event) =>
      normalizeSleepStageEventData(event, userId)
    );
    const startMs = normalizedEvents.map((s) =>
      new Date(s.start_time).getTime()
    );
    const endMs = normalizedEvents.map((s) => new Date(s.end_time).getTime());
    const payloadStart = new Date(Math.min(...startMs));
    const payloadEnd = new Date(Math.max(...endMs));
    await deleteSupersededSleepStagesWithClient(
      client,
      userId,
      entryId,
      payloadStart,
      payloadEnd,
      normalizedEvents
    );
    const results = [];
    for (const stageEvent of normalizedEvents) {
      results.push(
        await upsertSleepStageEventWithClient(
          client,
          userId,
          entryId,
          stageEvent,
          actingUserId
        )
      );
    }
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error merging sleep stage events for entry ${entryId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSleepStageEventsByEntryId(userId: any, entryId: any) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `SELECT id, stage_type, start_time, end_time, duration_in_seconds
       FROM sleep_entry_stages
       WHERE entry_id = $1 AND user_id = $2
       ORDER BY start_time ASC`,
      [entryId, userId]
    );
    return result.rows;
  } catch (error) {
    log(
      'error',
      `Error fetching sleep stage events for entry ${entryId} for user ${userId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function updateSleepEntryAggregates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aggregates: any
) {
  const client = await getClient(userId);
  try {
    const result = await client.query(
      `UPDATE sleep_entries
       SET bedtime = $3,
           wake_time = $4,
           duration_in_seconds = $5,
           time_asleep_in_seconds = $6,
           sleep_score = $7,
           deep_sleep_seconds = $8,
           light_sleep_seconds = $9,
           rem_sleep_seconds = $10,
           awake_sleep_seconds = $11,
           updated_by_user_id = $12,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [
        entryId,
        userId,
        aggregates.bedtime,
        aggregates.wake_time,
        aggregates.duration_in_seconds,
        aggregates.time_asleep_in_seconds,
        aggregates.sleep_score,
        aggregates.deep_sleep_seconds,
        aggregates.light_sleep_seconds,
        aggregates.rem_sleep_seconds,
        aggregates.awake_sleep_seconds,
        actingUserId,
      ]
    );
    if (result.rows.length === 0) {
      throw new Error(
        `Sleep entry ${entryId} not found for user ${userId} during aggregate update.`
      );
    }
    return { id: result.rows[0].id, ...aggregates };
  } catch (error) {
    log(
      'error',
      `Error updating sleep entry aggregates for entry ${entryId} for user ${userId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function getSleepEntriesByUserIdAndDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const client = await getClient(userId);
  try {
    const query = `
        SELECT
        se.id,
            se.user_id,
            se.entry_date,
            se.bedtime,
            se.wake_time,
            se.duration_in_seconds,
            se.time_asleep_in_seconds,
            se.sleep_score,
            se.source,
            se.deep_sleep_seconds,
            se.light_sleep_seconds,
            se.rem_sleep_seconds,
            se.awake_sleep_seconds,
            se.average_spo2_value,
            se.lowest_spo2_value,
            se.highest_spo2_value,
            se.average_respiration_value,
            se.lowest_respiration_value,
            se.highest_respiration_value,
            se.awake_count,
            se.avg_sleep_stress,
            se.restless_moments_count,
            se.avg_overnight_hrv,
            se.body_battery_change,
            se.resting_heart_rate,
            se.created_at,
            se.updated_at,
            json_agg(sse.* ORDER BY sse.start_time) AS stage_events
            FROM sleep_entries se
            LEFT JOIN sleep_entry_stages sse ON se.id = sse.entry_id
            WHERE se.user_id = $1 AND se.entry_date BETWEEN $2 AND $3
            GROUP BY se.id
            ORDER BY se.entry_date DESC;
        `;
    const result = await client.query(query, [userId, startDate, endDate]);
    return result.rows;
  } catch (error) {
    log(
      'error',
      `Error fetching sleep entries for user ${userId} from ${startDate} to ${endDate}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}

async function updateSleepEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entryId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actingUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateData: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const {
      entry_date,
      bedtime,
      wake_time,
      duration_in_seconds,
      time_asleep_in_seconds,
      sleep_score,
      source,
      deep_sleep_seconds,
      light_sleep_seconds,
      rem_sleep_seconds,
      awake_sleep_seconds,
      average_spo2_value,
      lowest_spo2_value,
      highest_spo2_value,
      average_respiration_value,
      lowest_respiration_value,
      highest_respiration_value,
      awake_count,
      avg_sleep_stress,
      restless_moments_count,
      avg_overnight_hrv,
      body_battery_change,
      resting_heart_rate,
      stage_events, // Extract stage_events
    } = updateData;
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    if (entry_date !== undefined) {
      updateFields.push(`entry_date = $${paramIndex++} `);
      updateValues.push(entry_date);
    }
    if (bedtime !== undefined) {
      updateFields.push(`bedtime = $${paramIndex++} `);
      updateValues.push(bedtime);
    }
    if (wake_time !== undefined) {
      updateFields.push(`wake_time = $${paramIndex++} `);
      updateValues.push(wake_time);
    }
    if (duration_in_seconds !== undefined) {
      updateFields.push(`duration_in_seconds = $${paramIndex++} `);
      updateValues.push(duration_in_seconds);
    }
    if (time_asleep_in_seconds !== undefined) {
      updateFields.push(`time_asleep_in_seconds = $${paramIndex++} `);
      updateValues.push(time_asleep_in_seconds);
    }
    if (sleep_score !== undefined) {
      updateFields.push(`sleep_score = $${paramIndex++} `);
      updateValues.push(sleep_score);
    }
    if (source !== undefined) {
      updateFields.push(`source = $${paramIndex++} `);
      updateValues.push(source);
    }
    if (deep_sleep_seconds !== undefined) {
      updateFields.push(`deep_sleep_seconds = $${paramIndex++} `);
      updateValues.push(deep_sleep_seconds);
    }
    if (light_sleep_seconds !== undefined) {
      updateFields.push(`light_sleep_seconds = $${paramIndex++} `);
      updateValues.push(light_sleep_seconds);
    }
    if (rem_sleep_seconds !== undefined) {
      updateFields.push(`rem_sleep_seconds = $${paramIndex++} `);
      updateValues.push(rem_sleep_seconds);
    }
    if (awake_sleep_seconds !== undefined) {
      updateFields.push(`awake_sleep_seconds = $${paramIndex++} `);
      updateValues.push(awake_sleep_seconds);
    }
    if (average_spo2_value !== undefined) {
      updateFields.push(`average_spo2_value = $${paramIndex++} `);
      updateValues.push(average_spo2_value);
    }
    if (lowest_spo2_value !== undefined) {
      updateFields.push(`lowest_spo2_value = $${paramIndex++} `);
      updateValues.push(lowest_spo2_value);
    }
    if (highest_spo2_value !== undefined) {
      updateFields.push(`highest_spo2_value = $${paramIndex++} `);
      updateValues.push(highest_spo2_value);
    }
    if (average_respiration_value !== undefined) {
      updateFields.push(`average_respiration_value = $${paramIndex++} `);
      updateValues.push(average_respiration_value);
    }
    if (lowest_respiration_value !== undefined) {
      updateFields.push(`lowest_respiration_value = $${paramIndex++} `);
      updateValues.push(lowest_respiration_value);
    }
    if (highest_respiration_value !== undefined) {
      updateFields.push(`highest_respiration_value = $${paramIndex++} `);
      updateValues.push(highest_respiration_value);
    }
    if (awake_count !== undefined) {
      updateFields.push(`awake_count = $${paramIndex++} `);
      updateValues.push(awake_count);
    }
    if (avg_sleep_stress !== undefined) {
      updateFields.push(`avg_sleep_stress = $${paramIndex++} `);
      updateValues.push(avg_sleep_stress);
    }
    if (restless_moments_count !== undefined) {
      updateFields.push(`restless_moments_count = $${paramIndex++} `);
      updateValues.push(restless_moments_count);
    }
    if (avg_overnight_hrv !== undefined) {
      updateFields.push(`avg_overnight_hrv = $${paramIndex++} `);
      updateValues.push(avg_overnight_hrv);
    }
    if (body_battery_change !== undefined) {
      updateFields.push(`body_battery_change = $${paramIndex++} `);
      updateValues.push(body_battery_change);
    }
    if (resting_heart_rate !== undefined) {
      updateFields.push(`resting_heart_rate = $${paramIndex++} `);
      updateValues.push(resting_heart_rate);
    }
    // Add updated_by_user_id
    updateFields.push(`updated_by_user_id = $${paramIndex++}`);
    updateValues.push(actingUserId);
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    if (
      updateFields.length === 1 &&
      updateFields[0].includes('updated_at') &&
      !stage_events
    ) {
      // Only updated_at, no other fields to update
      await client.query('COMMIT');
      return {
        id: entryId,
        message: 'No specific fields to update for sleep entry.',
      };
    }
    if (updateFields.length > 0) {
      const updateQuery = `
                UPDATE sleep_entries
                SET ${updateFields.join(', ')}
                WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
                RETURNING id;
        `;
      updateValues.push(entryId, userId);
      const result = await client.query(updateQuery, updateValues);
      if (result.rows.length === 0) {
        throw new Error(
          `Sleep entry with ID ${entryId} not found for user ${userId}.`
        );
      }
    }
    // Handle stage_events if provided
    if (stage_events && stage_events.length > 0) {
      // Delete existing stage events for this entry
      await client.query(
        'DELETE FROM sleep_entry_stages WHERE entry_id = $1 AND user_id = $2',
        [entryId, userId]
      );
      // Insert new stage events with audit columns
      const stageEventInsertQuery = `
                INSERT INTO sleep_entry_stages(entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds, created_by_user_id, updated_by_user_id)
        VALUES($1, $2, $3, $4, $5, $6, $7, $7);
        `;
      for (const event of stage_events) {
        await client.query(stageEventInsertQuery, [
          entryId,
          userId,
          event.stage_type,
          event.start_time,
          event.end_time,
          event.duration_in_seconds,
          actingUserId, // Use actingUserId for creation/update
        ]);
      }
      log('info', `Updated sleep stage events for entry ${entryId}.`);
    } else if (stage_events && stage_events.length === 0) {
      // If an empty array is sent, it means all stage events should be deleted
      await client.query(
        'DELETE FROM sleep_entry_stages WHERE entry_id = $1 AND user_id = $2',
        [entryId, userId]
      );
      log(
        'info',
        `Deleted all sleep stage events for entry ${entryId} as an empty array was provided.`
      );
    }
    await client.query('COMMIT');
    return { id: entryId, ...updateData };
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error updating sleep entry ${entryId} for user ${userId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteSleepStageEventsByEntryId(userId: any, entryId: any) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const query = `
            DELETE FROM sleep_entry_stages
            WHERE entry_id = $1 AND user_id = $2;
        `;
    await client.query(query, [entryId, userId]);
    await client.query('COMMIT');
    log(
      'info',
      `Deleted all sleep stage events for entry ${entryId} for user ${userId}.`
    );
    return {
      message: `Deleted all sleep stage events for entry ${entryId} for user ${userId}.`,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting sleep stage events for entry ${entryId} for user ${userId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
async function deleteSleepEntriesByEntrySourceAndDate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entrySource: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    const query = `
            DELETE FROM sleep_entries
            WHERE user_id = $1 AND source = $2 AND entry_date BETWEEN $3 AND $4
            RETURNING id;
        `;
    log(
      'debug',
      `[sleepRepository.deleteSleepEntriesByEntrySourceAndDate] Deletion query: ${query} `
    );
    log(
      'debug',
      `[sleepRepository.deleteSleepEntriesByEntrySourceAndDate] Deletion parameters: userId = ${userId}, entrySource = ${entrySource}, startDate = ${startDate}, endDate = ${endDate} `
    );
    const result = await client.query(query, [
      userId,
      entrySource,
      startDate,
      endDate,
    ]);
    await client.query('COMMIT');
    log(
      'info',
      `Deleted ${result.rows.length} sleep entries for user ${userId} from source ${entrySource} between ${startDate} and ${endDate}.`
    );
    return { message: `Deleted ${result.rows.length} sleep entries.` };
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting sleep entries for user ${userId} from source ${entrySource} between ${startDate} and ${endDate}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
async function getSleepEntriesWithAllDetailsByUserIdAndDateRange(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  startDate: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endDate: any
) {
  const client = await getClient(userId);
  try {
    const query = `
        SELECT
        se.id,
            se.user_id,
            se.entry_date,
            se.bedtime,
            se.wake_time,
            se.duration_in_seconds,
            se.time_asleep_in_seconds,
            se.sleep_score,
            se.source,
            se.deep_sleep_seconds,
            se.light_sleep_seconds,
            se.rem_sleep_seconds,
            se.awake_sleep_seconds,
            se.average_spo2_value,
            se.lowest_spo2_value,
            se.highest_spo2_value,
            se.average_respiration_value,
            se.lowest_respiration_value,
            se.highest_respiration_value,
            se.awake_count,
            se.avg_sleep_stress,
            se.restless_moments_count,
            se.avg_overnight_hrv,
            se.body_battery_change,
            se.resting_heart_rate,
            se.created_at,
            se.updated_at,
            json_agg(
                CASE
                        WHEN sse.id IS NOT NULL THEN json_build_object(
                    'id', sse.id,
                    'entry_id', sse.entry_id,
                    'user_id', sse.user_id,
                    'stage_type', sse.stage_type,
                    'start_time', sse.start_time,
                    'end_time', sse.end_time,
                    'duration_in_seconds', sse.duration_in_seconds,
                    'created_at', sse.created_at,
                    'updated_at', sse.updated_at
                )
                        ELSE NULL
                    END
            ) FILTER(WHERE sse.id IS NOT NULL) AS stage_events
            FROM sleep_entries se
            LEFT JOIN sleep_entry_stages sse ON se.id = sse.entry_id
            WHERE se.user_id = $1 AND se.entry_date BETWEEN $2 AND $3
            GROUP BY se.id
            ORDER BY se.entry_date DESC;
        `;
    const result = await client.query(query, [userId, startDate, endDate]);
    return result.rows;
  } catch (error) {
    log(
      'error',
      `Error fetching sleep entries with all details for user ${userId} from ${startDate} to ${endDate}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function deleteSleepEntry(userId: any, entryId: any) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    // First, delete associated sleep stage events
    await deleteSleepStageEventsByEntryId(userId, entryId);
    const deleteQuery = `
            DELETE FROM sleep_entries
            WHERE id = $1 AND user_id = $2
            RETURNING id;
        `;
    const result = await client.query(deleteQuery, [entryId, userId]);
    if (result.rows.length === 0) {
      throw new Error(
        `Sleep entry with ID ${entryId} not found for user ${userId}.`
      );
    }
    await client.query('COMMIT');
    log('info', `Deleted sleep entry ${entryId} for user ${userId}.`);
    return { message: `Sleep entry ${entryId} deleted successfully.` };
  } catch (error) {
    await client.query('ROLLBACK');
    log(
      'error',
      `Error deleting sleep entry ${entryId} for user ${userId}: `,
      error
    );
    throw error;
  } finally {
    client.release();
  }
}
export { upsertSleepEntry };
export { upsertSleepStageEvent };
export { mergeSleepStageEvents };
export { getSleepStageEventsByEntryId };
export { updateSleepEntryAggregates };
export { getSleepEntriesByUserIdAndDateRange };
export { updateSleepEntry };
export { deleteSleepStageEventsByEntryId };
export { deleteSleepEntry };
export { getSleepEntriesWithAllDetailsByUserIdAndDateRange };
export { deleteSleepEntriesByEntrySourceAndDate };
export default {
  upsertSleepEntry,
  upsertSleepStageEvent,
  mergeSleepStageEvents,
  getSleepStageEventsByEntryId,
  updateSleepEntryAggregates,
  getSleepEntriesByUserIdAndDateRange,
  updateSleepEntry,
  deleteSleepStageEventsByEntryId,
  deleteSleepEntry,
  getSleepEntriesWithAllDetailsByUserIdAndDateRange,
  deleteSleepEntriesByEntrySourceAndDate,
};
