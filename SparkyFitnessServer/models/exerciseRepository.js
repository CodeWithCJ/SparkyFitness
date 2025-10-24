const { getClient } = require('../db/poolManager');
const { log } = require('../config/logging');
const exerciseDb = require('./exercise');
const exerciseEntryDb = require('./exerciseEntry');
const exerciseTemplateDb = require('./exerciseTemplate');

async function getExercisesNeedingReview(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT DISTINCT ON (ee.exercise_id)
          ee.exercise_id,
          e.name AS exercise_name,
          e.calories_per_hour AS exercise_calories_per_hour,
          e.updated_at AS exercise_updated_at,
          ee.created_at AS entry_created_at,
          e.user_id AS exercise_owner_id
       FROM exercise_entries ee
       JOIN exercises e ON ee.exercise_id = e.id
       WHERE ee.user_id = $1
         AND e.updated_at > ee.created_at -- Exercise has been updated since the entry was created
         AND NOT EXISTS (
             SELECT 1 FROM user_ignored_updates uiu
             WHERE uiu.user_id = $1
               AND uiu.variant_id = ee.exercise_id -- Using exercise_id as variant_id for exercises
               AND uiu.ignored_at_timestamp = e.updated_at
         )
       ORDER BY ee.exercise_id, ee.created_at DESC`,
      [userId]
    );
    return result.rows;
  } finally {
    client.release();
  }
}

async function updateExerciseEntriesSnapshot(userId, exerciseId, newSnapshotData) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      `UPDATE exercise_entries
       SET
          exercise_name = $1,
          calories_per_hour = $2
       WHERE user_id = $3 AND exercise_id = $4
       RETURNING id`,
      [
        newSnapshotData.exercise_name,
        newSnapshotData.calories_per_hour,
        userId,
        exerciseId,
      ]
    );
    return result.rowCount;
  } finally {
    client.release();
  }
}

async function clearUserIgnoredUpdate(userId, variantId) {
  const client = await getClient(userId); // User-specific operation
  try {
    await client.query(
      `DELETE FROM user_ignored_updates
       WHERE user_id = $1 AND variant_id = $2`,
      [userId, variantId]
    );
  } finally {
    client.release();
  }
}

module.exports = {
  ...exerciseDb,
  ...exerciseEntryDb,
  ...exerciseTemplateDb,
  getExercisesNeedingReview,
  updateExerciseEntriesSnapshot,
  clearUserIgnoredUpdate,
  deleteExerciseAndDependencies: exerciseDb.deleteExerciseAndDependencies,
  getExerciseDeletionImpact: exerciseDb.getExerciseDeletionImpact,
};
