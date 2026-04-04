const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const poolManager = require('../db/poolManager');
const { log } = require('../config/logging');
const crypto = require('crypto');

/**
 * GET Telegram Link Status
 */
router.get('/status', authenticate, async (req, res) => {
  const userId = req.user.id;
  const client = await poolManager.getSystemClient();
  try {
    const result = await client.query(
      'SELECT telegram_chat_id FROM public."user" WHERE id = $1',
      [userId]
    );
    res.json({
      isLinked: !!result.rows[0]?.telegram_chat_id,
      chatId: result.rows[0]?.telegram_chat_id || null
    });
  } catch (error) {
    log('error', `Error checking Telegram status: ${error.message}`);
    res.status(500).json({ message: 'Error checking Telegram status' });
  } finally {
    client.release();
  }
});

/**
 * POST Generate Linking Code
 */
router.post('/link-code', authenticate, async (req, res) => {
  const userId = req.user.id;
  // Generate a random 6-character code
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const client = await poolManager.getSystemClient();
  try {
    await client.query(
      'UPDATE public."user" SET telegram_link_code = $1 WHERE id = $2',
      [code, userId]
    );
    res.json({ code });
  } catch (error) {
    log('error', `Error generating Telegram link code: ${error.message}`);
    res.status(500).json({ message: 'Error generating link code' });
  } finally {
    client.release();
  }
});

/**
 * POST Unlink Telegram
 */
router.post('/unlink', authenticate, async (req, res) => {
  const userId = req.user.id;
  const client = await poolManager.getSystemClient();
  try {
    await client.query(
      'UPDATE public."user" SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = $1',
      [userId]
    );
    res.json({ message: 'Telegram account unlinked successfully' });
  } catch (error) {
    log('error', `Error unlinking Telegram: ${error.message}`);
    res.status(500).json({ message: 'Error unlinking Telegram' });
  } finally {
    client.release();
  }
});

module.exports = router;
