import { getClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';
import { v4 as uuidv4 } from 'uuid';

class AllergenPreferenceService {
  static async getAllergenPreferences(userId: string) {
    const client = await getClient(userId);
    try {
      const result = await client.query(
        'SELECT * FROM user_allergen_preferences WHERE user_id = $1 ORDER BY allergen_name',
        [userId]
      );
      return result.rows;
    } finally {
      client.release();
    }
  }

  static async addAllergenPreference(userId: string, allergenName: string) {
    const client = await getClient(userId);
    try {
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO user_allergen_preferences (id, user_id, allergen_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, allergen_name) DO NOTHING
         RETURNING *`,
        [id, userId, allergenName]
      );
      if (result.rows.length === 0) {
        const existing = await client.query(
          'SELECT * FROM user_allergen_preferences WHERE user_id = $1 AND allergen_name = $2',
          [userId, allergenName]
        );
        return existing.rows[0];
      }
      log(
        'info',
        `Allergen preference added: ${allergenName} for user ${userId}`
      );
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  static async deleteAllergenPreference(userId: string, id: string) {
    const client = await getClient(userId);
    try {
      const result = await client.query(
        'DELETE FROM user_allergen_preferences WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, userId]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }
}

export default AllergenPreferenceService;
