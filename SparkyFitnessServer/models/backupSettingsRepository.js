const { getSystemClient } = require('../db/poolManager');
const { log } = require('../config/logging');

class BackupSettingsRepository {
  async getBackupSettings() {
    const client = await getSystemClient(); // System-level operation
    try {
      const result = await client.query('SELECT * FROM backup_settings LIMIT 1');
      if (result.rows.length === 0) {
        // If no settings exist, create a default entry
        log('info', 'No backup settings found, creating default entry.');
        return this.createDefaultBackupSettings();
      }
      return result.rows[0];
    } catch (error) {
      log('error', 'Error fetching backup settings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async createDefaultBackupSettings() {
    const client = await getSystemClient(); // System-level operation
    try {
      const result = await client.query(
        `INSERT INTO backup_settings (backup_enabled, backup_days, backup_time, retention_days)
         VALUES (FALSE, '{}', '02:00', 7)
         ON CONFLICT ((id IS NOT NULL)) DO NOTHING
         RETURNING *;`
      );
      // If the insert didn't return a row (due to ON CONFLICT DO NOTHING), fetch the existing one
      if (result.rows.length === 0) {
        return this.getBackupSettings();
      }
      return result.rows[0];
    } catch (error) {
      log('error', 'Error creating default backup settings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateBackupSettings({ backup_enabled, backup_days, backup_time, retention_days }) {
    const client = await getSystemClient(); // System-level operation
    try {
      const result = await client.query(
        `UPDATE backup_settings
         SET backup_enabled = $1,
              backup_days = $2,
              backup_time = $3,
              retention_days = $4,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM backup_settings LIMIT 1)
          RETURNING *;`,
        [backup_enabled, backup_days, backup_time, retention_days]
      );
      if (result.rows.length === 0) {
        // This case should ideally not happen if getBackupSettings ensures a row exists
        throw new Error('Backup settings row not found for update.');
      }
      return result.rows[0];
    } catch (error) {
      log('error', 'Error updating backup settings:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async updateLastBackupStatus(status, timestamp) {
    const client = await getSystemClient(); // System-level operation
    try {
      log('info', `Attempting to update last backup status to: ${status} at ${timestamp}`);
      const result = await client.query(
        `UPDATE backup_settings
          SET last_backup_status = $1,
              last_backup_timestamp = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = (SELECT id FROM backup_settings LIMIT 1)
          RETURNING *;`,
        [status, timestamp]
      );
      if (result.rows.length === 0) {
        log('error', 'Backup settings row not found for status update. This should not happen if default settings are created.');
        throw new Error('Backup settings row not found for status update.');
      }
      log('info', `Successfully updated last backup status. New settings:`, result.rows[0]);
      return result.rows[0];
    } catch (error) {
      log('error', 'Error updating last backup status:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = new BackupSettingsRepository();