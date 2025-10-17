console.log('DEBUG: Loading measurementRepository.js');
const { getPool } = require('../db/poolManager');
const { log } = require('../config/logging');

async function upsertStepData(userId, value, date) {
  const client = await getPool().connect();
  try {
    const existingRecord = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );

    let result;
    if (existingRecord.rows.length > 0) {
      const updateResult = await client.query(
        'UPDATE check_in_measurements SET steps = $1, updated_at = $2 WHERE user_id = $3 AND entry_date = $4 RETURNING *',
        [value, new Date().toISOString(), userId, date]
      );
      result = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        'INSERT INTO check_in_measurements (user_id, entry_date, steps, updated_at) VALUES ($1, $2, $3, $4) RETURNING *',
        [userId, date, value, new Date().toISOString()]
      );
      result = insertResult.rows[0];
    }
    return result;
  } finally {
    client.release();
  }
}

async function upsertWaterData(userId, waterMl, date) {
  const client = await getPool().connect();
  try {
    const existingRecord = await client.query(
      'SELECT id, water_ml FROM water_intake WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );

    let result;
    if (existingRecord.rows.length > 0) {
      const updateResult = await client.query(
        'UPDATE water_intake SET water_ml = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [waterMl, existingRecord.rows[0].id]
      );
      result = updateResult.rows[0];
    } else {
      const insertResult = await client.query(
        'INSERT INTO water_intake (user_id, entry_date, water_ml, created_at, updated_at) VALUES ($1, $2, $3, now(), now()) RETURNING *',
        [userId, date, waterMl]
      );
      result = insertResult.rows[0];
    }
    return result;
  } finally {
    client.release();
  }
}

async function getWaterIntakeByDate(userId, date) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT water_ml FROM water_intake WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getWaterIntakeEntryById(id) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT * FROM water_intake WHERE id = $1',
      [id]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getWaterIntakeEntryOwnerId(id) {
  const client = await getPool().connect();
  try {
    const entryResult = await client.query(
      'SELECT user_id FROM water_intake WHERE id = $1',
      [id]
    );
    return entryResult.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function updateWaterIntake(id, userId, updateData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `UPDATE water_intake SET
        water_ml = COALESCE($1, water_ml),
        entry_date = COALESCE($2, entry_date),
        updated_at = now()
      WHERE id = $3 AND user_id = $4
      RETURNING *`,
      [updateData.water_ml, updateData.entry_date, id, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteWaterIntake(id, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'DELETE FROM water_intake WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function upsertCheckInMeasurements(userId, entryDate, measurements) {
  const client = await getPool().connect();
  try {
    let query;
    let values;
    const measurementKeys = Object.keys(measurements);

    if (measurementKeys.length === 0) {
      // If no measurements are provided, and no existing record, there's nothing to do.
      // If there's an existing record, we don't update it if no new measurements are provided.
      return null; // Return null if no measurements to update/insert
    }

    const existingRecord = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, entryDate]
    );

    if (existingRecord.rows.length > 0) {
      const fields = measurementKeys.map((key, index) => `${key} = $${index + 3}`).join(', ');
      values = [userId, entryDate, ...Object.values(measurements), new Date().toISOString()];
      query = `UPDATE check_in_measurements SET ${fields}, updated_at = $${values.length} WHERE user_id = $1 AND entry_date = $2 RETURNING *`;
    } else {
      const cols = ['user_id', 'entry_date', ...measurementKeys, 'created_at', 'updated_at'];
      const placeholders = cols.map((_, index) => `$${index + 1}`).join(', ');
      values = [userId, entryDate, ...Object.values(measurements), new Date().toISOString(), new Date().toISOString()];
      query = `INSERT INTO check_in_measurements (${cols.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    }

    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getCheckInMeasurementsByDate(userId, date) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date = $2',
      [userId, date]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateCheckInMeasurements(userId, entryDate, updateData) {
  log('info', `[measurementRepository] updateCheckInMeasurements called with: userId=${userId}, entryDate=${entryDate}, updateData=`, updateData);
  const client = await getPool().connect();
  try {
    const fieldsToUpdate = Object.keys(updateData)
      .filter(key => ['weight', 'neck', 'waist', 'hips', 'steps'].includes(key))
      .map((key, index) => `${key} = $${index + 1}`);

    if (fieldsToUpdate.length === 0) {
      log('warn', `[measurementRepository] No valid fields to update for check-in measurement userId: ${userId}, entryDate: ${entryDate}`);
      return null;
    }

    const values = Object.values(updateData).filter((_value, index) => {
      const key = Object.keys(updateData)[index];
      return ['weight', 'neck', 'waist', 'hips', 'steps'].includes(key);
    });

    values.push(userId, entryDate);

    const query = `
      UPDATE check_in_measurements
      SET ${fieldsToUpdate.join(', ')}, updated_at = now()
      WHERE user_id = $${values.length - 1} AND entry_date = $${values.length}
      RETURNING *`;

    log('debug', `[measurementRepository] Executing query: ${query}`);
    log('debug', `[measurementRepository] Query values: ${JSON.stringify(values)}`);
    const result = await client.query(query, values);
    if (result.rows[0]) {
      log('info', `[measurementRepository] Successfully updated check-in measurement for userId: ${userId}, entryDate: ${entryDate}`);
    } else {
      log('warn', `[measurementRepository] No rows updated for check-in measurement userId: ${userId}, entryDate: ${entryDate}`);
    }
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteCheckInMeasurements(id, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'DELETE FROM check_in_measurements WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getCustomCategories(userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT id, name, frequency, measurement_type, data_type FROM custom_categories WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function createCustomCategory(categoryData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `INSERT INTO custom_categories (user_id, name, frequency, measurement_type, data_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now()) RETURNING id`,
      [categoryData.user_id, categoryData.name, categoryData.frequency, categoryData.measurement_type, categoryData.data_type]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateCustomCategory(id, userId, updateData) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `UPDATE custom_categories SET
        name = COALESCE($1, name),
        frequency = COALESCE($2, frequency),
        measurement_type = COALESCE($3, measurement_type),
        data_type = COALESCE($4, data_type),
        updated_at = now()
      WHERE id = $5 AND user_id = $6
      RETURNING *`,
      [updateData.name, updateData.frequency, updateData.measurement_type, updateData.data_type, id, userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteCustomCategory(id, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'DELETE FROM custom_categories WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

async function getCheckInMeasurementOwnerId(id) { // This function is problematic if 'id' is not the primary key
  log('warn', `[measurementRepository] getCheckInMeasurementOwnerId called with id: ${id}. This function might be problematic if 'id' is not the primary key for check_in_measurements.`);
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT user_id FROM check_in_measurements WHERE id = $1',
      [id]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function getCustomCategoryOwnerId(id) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT user_id FROM custom_categories WHERE id = $1',
      [id]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}

async function getCustomMeasurementEntries(userId, limit, orderBy, filter) {
  const client = await getPool().connect();
  try {
    let query = `
      SELECT cm.*,
             json_build_object(
               'name', cc.name,
               'measurement_type', cc.measurement_type,
               'frequency', cc.frequency,
               'data_type', cc.data_type
             ) AS custom_categories
      FROM custom_measurements cm
      JOIN custom_categories cc ON cm.category_id = cc.id
      WHERE cm.user_id = $1
    `;
    const queryParams = [userId];
    let paramIndex = 2;

    if (filter) {
      const filterParts = filter.split('.');
      if (filterParts.length === 3 && filterParts[0] === 'value' && filterParts[1] === 'gt') {
        query += ` AND cm.value > $${paramIndex}`;
        queryParams.push(parseFloat(filterParts[2]));
        paramIndex++;
      }
    }

    if (orderBy) {
      const [field, order] = orderBy.split('.');
      const allowedFields = ['entry_timestamp', 'value'];
      const allowedOrders = ['asc', 'desc'];
      if (allowedFields.includes(field) && allowedOrders.includes(order)) {
        query += ` ORDER BY cm.${field} ${order.toUpperCase()}`;
      }
    } else {
      query += ` ORDER BY cm.entry_timestamp DESC`;
    }

    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      queryParams.push(parseInt(limit, 10));
      paramIndex++;
    }

    const result = await client.query(query, queryParams);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCustomMeasurementEntriesByDate(userId, date) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT cm.*,
             json_build_object(
               'name', cc.name,
               'measurement_type', cc.measurement_type,
               'frequency', cc.frequency,
               'data_type', cc.data_type
             ) AS custom_categories
       FROM custom_measurements cm
       JOIN custom_categories cc ON cm.category_id = cc.id
       WHERE cm.user_id = $1 AND cm.entry_date = $2
       ORDER BY cm.entry_timestamp DESC`,
      [userId, date]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCheckInMeasurementsByDateRange(userId, startDate, endDate) {
  log('info', `[measurementRepository] getCheckInMeasurementsByDateRange called for userId: ${userId}, startDate: ${startDate}, endDate: ${endDate}`);
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT * FROM check_in_measurements WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date',
      [userId, startDate, endDate]
    );
    log('debug', `[measurementRepository] getCheckInMeasurementsByDateRange returning: ${JSON.stringify(result.rows)}`);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getCustomMeasurementsByDateRange(userId, categoryId, startDate, endDate) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT category_id, entry_date AS date, entry_hour AS hour, value, entry_timestamp AS timestamp FROM custom_measurements WHERE user_id = $1 AND category_id = $2 AND entry_date BETWEEN $3 AND $4 ORDER BY entry_date, entry_timestamp',
      [userId, categoryId, startDate, endDate]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function upsertCustomMeasurement(userId, categoryId, value, entryDate, entryHour, entryTimestamp, notes) {
  const client = await getPool().connect();
  try {
    let query;
    let values;

    // Check if an entry already exists for the given user, category, date, and hour (if applicable)
    let existingEntryQuery = `
      SELECT id FROM custom_measurements
      WHERE user_id = $1 AND category_id = $2 AND entry_date = $3
    `;
    let existingEntryValues = [userId, categoryId, entryDate];

    if (entryHour !== null) {
      existingEntryQuery += ` AND entry_hour = $4`;
      existingEntryValues.push(entryHour);
    }

    const existingEntry = await client.query(existingEntryQuery, existingEntryValues);

    if (existingEntry.rows.length > 0) {
      // Update existing entry
      const id = existingEntry.rows[0].id;
      query = `
        UPDATE custom_measurements
        SET value = $1, entry_timestamp = $2, notes = $3, updated_at = now()
        WHERE id = $4 AND user_id = $5
        RETURNING *
      `;
      values = [value, entryTimestamp, notes, id, userId];
    } else {
      // Insert new entry
      query = `
        INSERT INTO custom_measurements (user_id, category_id, value, entry_date, entry_hour, entry_timestamp, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
        RETURNING *
      `;
      // Ensure userId is the first value, then categoryId, then value, etc.
      // Filter out user_id if it somehow made it into the incoming payload for custom measurements
      const filteredCustomValues = [categoryId, value, entryDate, entryHour, entryTimestamp, notes];
      values = [userId, ...filteredCustomValues];
    }

    const result = await client.query(query, values);
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function deleteCustomMeasurement(id, userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'DELETE FROM custom_measurements WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

module.exports = {
  upsertStepData,
  upsertWaterData,
  getWaterIntakeByDate,
  getWaterIntakeEntryById,
  getWaterIntakeEntryOwnerId,
  updateWaterIntake,
  deleteWaterIntake,
  upsertCheckInMeasurements,
  getCheckInMeasurementsByDate,
  updateCheckInMeasurements,
  deleteCheckInMeasurements,
  getCustomCategories,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  getCustomMeasurementEntries,
  getCustomMeasurementEntriesByDate,
  getCheckInMeasurementsByDateRange,
  getCustomMeasurementsByDateRange,
  getCustomCategoryOwnerId,
  upsertCustomMeasurement,
  deleteCustomMeasurement,
  getCustomMeasurementOwnerId,
  getLatestMeasurement,
};

async function getLatestMeasurement(userId) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT weight FROM check_in_measurements
       WHERE user_id = $1 AND weight IS NOT NULL
       ORDER BY entry_date DESC, updated_at DESC
       LIMIT 1`,
      [userId]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getCustomMeasurementOwnerId(id) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      'SELECT user_id FROM custom_measurements WHERE id = $1',
      [id]
    );
    return result.rows[0]?.user_id;
  } finally {
    client.release();
  }
}
