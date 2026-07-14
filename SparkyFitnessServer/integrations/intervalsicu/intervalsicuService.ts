import axios from 'axios';
import { getSystemClient } from '../../db/poolManager.js';
import { decrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { log } from '../../config/logging.js';

const INTERVALS_API_BASE_URL = 'https://intervals.icu/api/v1';

/**
 * Fetch activities for the authenticated athlete
 * Uses API_KEY as username, api key as password (Basic auth)
 */
export async function fetchActivities(userId: number, oldest: string, limit = 100) {
  const { apiKey } = await getCredentials(userId);
  const url = `${INTERVALS_API_BASE_URL}/athlete/0/activities?oldest=${oldest}&limit=${limit}`;
  const response = await axios.get(url, {
    auth: { username: 'API_KEY', password: apiKey },
    headers: { Accept: 'application/json' },
  });
  return response.data;
}

/**
 * Fetch wellness data (weight, steps, sleep, HR, etc.)
 */
export async function fetchWellness(userId: number, oldest: string, newest: string) {
  const { apiKey } = await getCredentials(userId);
  const url = `${INTERVALS_API_BASE_URL}/athlete/0/wellness?oldest=${oldest}&newest=${newest}`;
  const response = await axios.get(url, {
    auth: { username: 'API_KEY', password: apiKey },
    headers: { Accept: 'application/json' },
  });
  return response.data;
}

/**
 * Fetch athlete profile / settings
 */
export async function fetchAthlete(userId: number) {
  const { apiKey } = await getCredentials(userId);
  const url = `${INTERVALS_API_BASE_URL}/athlete/0`;
  const response = await axios.get(url, {
    auth: { username: 'API_KEY', password: apiKey },
    headers: { Accept: 'application/json' },
  });
  return response.data;
}

/**
 * Get connection status by checking if valid credentials exist
 */
export async function getStatus(userId: number) {
  try {
    const credentials = await getCredentials(userId);
    return {
      connected: !!credentials.apiKey,
      provider: 'intervalsicu',
    };
  } catch {
    return { connected: false, provider: 'intervalsicu' };
  }
}

/**
 * Disconnect — just clears the provider row
 */
export async function disconnectIntervalsIcu(userId: number) {
  const client = await getSystemClient();
  try {
    await client.query(
      `DELETE FROM external_data_providers WHERE user_id = $1 AND provider_type = 'intervalsicu'`,
      [userId]
    );
    return { success: true, message: 'Intervals.ICU disconnected.' };
  } finally {
    client.release();
  }
}

/**
 * Extract the encrypted API key from the DB
 */
async function getCredentials(userId: number) {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `SELECT encrypted_app_id, app_id_iv, app_id_tag
       FROM external_data_providers
       WHERE user_id = $1 AND provider_type = 'intervalsicu'`,
      [userId]
    );
    if (result.rows.length === 0) {
      throw new Error('Intervals.ICU credentials not found for user.');
    }
    const { encrypted_app_id, app_id_iv, app_id_tag } = result.rows[0];
    const apiKey = await decrypt(
      encrypted_app_id,
      app_id_iv,
      app_id_tag,
      ENCRYPTION_KEY
    );
    return { apiKey };
  } finally {
    client.release();
  }
}

export default {
  fetchActivities,
  fetchWellness,
  fetchAthlete,
  getStatus,
  disconnectIntervalsIcu,
};
