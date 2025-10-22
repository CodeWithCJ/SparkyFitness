const { getClient, getSystemClient } = require('../db/poolManager');
const { encrypt, decrypt, ENCRYPTION_KEY } = require('../security/encryption');
const { log } = require('../config/logging');

async function getExternalDataProviders(userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const result = await client.query(
      'SELECT id, user_id, provider_name, provider_type, is_active, base_url FROM external_data_providers ORDER BY created_at DESC',
      []
    );
    log('debug', `getExternalDataProviders: Raw query results for user ${userId}:`, result.rows);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getExternalDataProvidersByUserId(targetUserId) {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      `SELECT
        id, user_id, provider_name, provider_type, is_active, base_url,
        encrypted_app_id, app_id_iv, app_id_tag,
        encrypted_app_key, app_key_iv, app_key_tag,
        token_expires_at, external_user_id,
        encrypted_garth_dump, garth_dump_iv, garth_dump_tag
      FROM external_data_providers ORDER BY created_at DESC`,
      []
    );
    const providers = await Promise.all(result.rows.map(async (row) => {
      let decryptedAppId = null;
      let decryptedAppKey = null;
      let decryptedGarthDump = null;

      if (row.encrypted_app_id && row.app_id_iv && row.app_id_tag) {
        try {
          decryptedAppId = await decrypt(row.encrypted_app_id, row.app_id_iv, row.app_id_tag, ENCRYPTION_KEY);
        } catch (e) {
          log('error', 'Error decrypting app_id for provider:', row.id, e);
        }
      }
      if (row.encrypted_app_key && row.app_key_iv && row.app_key_tag) {
        try {
          decryptedAppKey = await decrypt(row.encrypted_app_key, row.app_key_iv, row.app_key_tag, ENCRYPTION_KEY);
        } catch (e) {
          log('error', 'Error decrypting app_key for provider:', row.id, e);
        }
      }
      if (row.encrypted_garth_dump && row.garth_dump_iv && row.garth_dump_tag) {
        try {
          decryptedGarthDump = await decrypt(row.encrypted_garth_dump, row.garth_dump_iv, row.garth_dump_tag, ENCRYPTION_KEY);
        } catch (e) {
          log('error', 'Error decrypting garth_dump for provider:', row.id, e);
        }
      }

      return {
        id: row.id,
        provider_name: row.provider_name,
        provider_type: row.provider_type,
        user_id: row.user_id,
        app_id: decryptedAppId,
        app_key: decryptedAppKey,
        token_expires_at: row.token_expires_at,
        external_user_id: row.external_user_id,
        garth_dump: decryptedGarthDump,
        is_active: row.is_active,
        base_url: row.base_url,
      };
    }));
    return providers;
  } finally {
    client.release();
  }
}

async function createExternalDataProvider(providerData) {
  const client = await getClient(providerData.user_id); // User-specific operation
  try {
    log('debug', 'createExternalDataProvider: Received providerData:', providerData);
    const {
      provider_name,
      provider_type,
      user_id,
      is_active,
      base_url,
      app_id,
      app_key,
      token_expires_at,
      external_user_id,
      encrypted_garth_dump,
      garth_dump_iv,
      garth_dump_tag,
    } = providerData;

    let encryptedAppId = null;
    let appIdIv = null;
    let appIdTag = null;
    if (app_id) {
      const encrypted = await encrypt(app_id, ENCRYPTION_KEY);
      encryptedAppId = encrypted.encryptedText;
      appIdIv = encrypted.iv;
      appIdTag = encrypted.tag;
    }

    let encryptedAppKey = null;
    let appKeyIv = null;
    let appKeyTag = null;
    if (app_key) {
      const encrypted = await encrypt(app_key, ENCRYPTION_KEY);
      encryptedAppKey = encrypted.encryptedText;
      appKeyIv = encrypted.iv;
      appKeyTag = encrypted.tag;
    }

    const result = await client.query(
      `INSERT INTO external_data_providers (
        provider_name, provider_type, user_id, is_active, base_url,
        encrypted_app_id, app_id_iv, app_id_tag,
        encrypted_app_key, app_key_iv, app_key_tag,
        token_expires_at, external_user_id,
        encrypted_garth_dump, garth_dump_iv, garth_dump_tag,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now()) RETURNING id`,
      [
        provider_name,
        provider_type,
        user_id,
        is_active,
        base_url,
        encryptedAppId,
        appIdIv,
        appIdTag,
        encryptedAppKey,
        appKeyIv,
        appKeyTag,
        token_expires_at,
        external_user_id,
        encrypted_garth_dump,
        garth_dump_iv,
        garth_dump_tag,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function updateExternalDataProvider(id, userId, updateData) {
  const client = await getClient(userId); // User-specific operation
  try {
    let encryptedAppId = updateData.encrypted_app_id || null;
    let appIdIv = updateData.app_id_iv || null;
    let appIdTag = updateData.app_id_tag || null;
    let encryptedAppKey = updateData.encrypted_app_key || null;
    let appKeyIv = updateData.app_key_iv || null;
    let appKeyTag = updateData.app_key_tag || null;

    let encryptedGarthDump = updateData.encrypted_garth_dump || null;
    let garthDumpIv = updateData.garth_dump_iv || null;
    let garthDumpTag = updateData.garth_dump_tag || null;

    if (updateData.app_id !== undefined) {
      const encryptedId = await encrypt(updateData.app_id, ENCRYPTION_KEY);
      encryptedAppId = encryptedId.encryptedText;
      appIdIv = encryptedId.iv;
      appIdTag = encryptedId.tag;
    }
    if (updateData.app_key !== undefined) {
      const encryptedKey = await encrypt(updateData.app_key, ENCRYPTION_KEY);
      encryptedAppKey = encryptedKey.encryptedText;
      appKeyIv = encryptedKey.iv;
      appKeyTag = encryptedKey.tag;
    }

    const result = await client.query(
      `UPDATE external_data_providers SET
        provider_name = COALESCE($1, provider_name),
        provider_type = COALESCE($2, provider_type),
        is_active = COALESCE($3, is_active),
        base_url = COALESCE($4, base_url),
        encrypted_app_id = COALESCE($5, encrypted_app_id),
        app_id_iv = COALESCE($6, app_id_iv),
        app_id_tag = COALESCE($7, app_id_tag),
        encrypted_app_key = COALESCE($8, encrypted_app_key),
        app_key_iv = COALESCE($9, app_key_iv),
        app_key_tag = COALESCE($10, app_key_tag),
        encrypted_garth_dump = COALESCE($11, encrypted_garth_dump),
        garth_dump_iv = COALESCE($12, garth_dump_iv),
        garth_dump_tag = COALESCE($13, garth_dump_tag),
        token_expires_at = COALESCE($14, token_expires_at),
        external_user_id = COALESCE($15, external_user_id),
        updated_at = now()
      WHERE id = $16
      RETURNING *`,
      [
        updateData.provider_name,
        updateData.provider_type,
        updateData.is_active,
        updateData.base_url,
        encryptedAppId,
        appIdIv,
        appIdTag,
        encryptedAppKey,
        appKeyIv,
        appKeyTag,
        encryptedGarthDump,
        garthDumpIv,
        garthDumpTag,
        updateData.token_expires_at,
        updateData.external_user_id,
        id,
      ]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

async function getExternalDataProviderById(providerId) {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      `SELECT
        id, provider_name, provider_type, user_id, is_active, base_url,
        encrypted_app_id, app_id_iv, app_id_tag,
        encrypted_app_key, app_key_iv, app_key_tag,
        token_expires_at, external_user_id,
        encrypted_garth_dump, garth_dump_iv, garth_dump_tag
      FROM external_data_providers WHERE id = $1`,
      [providerId]
    );
    const data = result.rows[0];
    if (!data) return null;

    let decryptedAppId = null;
    let decryptedAppKey = null;
    let decryptedGarthDump = null;

    if (data.encrypted_app_id && data.app_id_iv && data.app_id_tag) {
      try {
        decryptedAppId = await decrypt(data.encrypted_app_id, data.app_id_iv, data.app_id_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting app_id for provider:', providerId, e);
      }
    }
    if (data.encrypted_app_key && data.app_key_iv && data.app_key_tag) {
      try {
        decryptedAppKey = await decrypt(data.encrypted_app_key, data.app_key_iv, data.app_key_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting app_key for provider:', providerId, e);
      }
    }
    if (data.encrypted_garth_dump && data.garth_dump_iv && data.garth_dump_tag) {
      try {
        decryptedGarthDump = await decrypt(data.encrypted_garth_dump, data.garth_dump_iv, data.garth_dump_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting garth_dump for provider:', providerId, e);
      }
    }

    return {
      id: data.id,
      provider_name: data.provider_name,
      provider_type: data.provider_type,
      user_id: data.user_id,
      is_active: data.is_active,
      base_url: data.base_url,
      app_id: decryptedAppId,
      app_key: decryptedAppKey,
      token_expires_at: data.token_expires_at,
      external_user_id: data.external_user_id,
      garth_dump: decryptedGarthDump
    };
  } finally {
    client.release();
  }
}

async function getExternalDataProviderByUserIdAndProviderName(userId, providerName) {
  const client = await getClient(userId); // User-specific operation
  try {
    log('debug', `Fetching external data provider for user ${userId} and provider ${providerName}`);
    const result = await client.query(
      `SELECT
        id, provider_name, provider_type, encrypted_app_id, app_id_iv, app_id_tag,
        encrypted_app_key, app_key_iv, app_key_tag,
        token_expires_at, external_user_id, is_active, base_url, updated_at,
        encrypted_garth_dump, garth_dump_iv, garth_dump_tag
      FROM external_data_providers WHERE provider_name = $1`,
      [providerName]
    );
    const data = result.rows[0];
    if (!data) {
      log('debug', `No external data provider found for user ${userId} and provider ${providerName}`);
      return null;
    }

    let decryptedAppId = null;
    let decryptedAppKey = null;
    let decryptedGarthDump = null;

    if (data.encrypted_app_id && data.app_id_iv && data.app_id_tag) {
      try {
        decryptedAppId = await decrypt(data.encrypted_app_id, data.app_id_iv, data.app_id_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting app_id for provider:', data.id, e);
      }
    }
    if (data.encrypted_app_key && data.app_key_iv && data.app_key_tag) {
      try {
        decryptedAppKey = await decrypt(data.encrypted_app_key, data.app_key_iv, data.app_key_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting app_key for provider:', data.id, e);
      }
    }
    if (data.encrypted_garth_dump && data.garth_dump_iv && data.garth_dump_tag) {
      try {
        decryptedGarthDump = await decrypt(data.encrypted_garth_dump, data.garth_dump_iv, data.garth_dump_tag, ENCRYPTION_KEY);
      } catch (e) {
        log('error', 'Error decrypting garth_dump for provider:', data.id, e);
      }
    }

    return {
      id: data.id,
      provider_name: data.provider_name,
      provider_type: data.provider_type,
      user_id: data.user_id,
      is_active: data.is_active,
      base_url: data.base_url,
      app_id: decryptedAppId,
      app_key: decryptedAppKey,
      token_expires_at: data.token_expires_at,
      external_user_id: data.external_user_id,
      garth_dump: decryptedGarthDump,
      updated_at: data.updated_at // Include updated_at
    };
  } finally {
    client.release();
  }
}

async function checkExternalDataProviderOwnership(providerId, userId) {
  const client = await getClient(userId); // User-specific operation
  try {
    const checkOwnership = await client.query(
      'SELECT 1 FROM external_data_providers WHERE id = $1',
      [providerId]
    );
    return checkOwnership.rowCount > 0;
  } finally {
    client.release();
  }
}
 
async function deleteExternalDataProvider(id) {
  const client = await getClient(id); // User-specific operation (RLS will handle access)
  try {
    const result = await client.query(
      'DELETE FROM external_data_providers WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

module.exports = {
  getExternalDataProviders,
  getExternalDataProvidersByUserId,
  createExternalDataProvider,
  updateExternalDataProvider,
  getExternalDataProviderById,
  checkExternalDataProviderOwnership,
  deleteExternalDataProvider,
  getExternalDataProviderByUserIdAndProviderName, // Add the new function to exports
};