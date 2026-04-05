import express, { Request, Response, Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import poolManager from '../db/poolManager';
import { log } from '../config/logging';
import crypto from 'crypto';
import { 
    telegramStatusResponseSchema, 
    telegramLinkCodeResponseSchema 
} from '@workspace/shared';

const router: Router = express.Router();

interface AuthRequest extends Request {
    user: {
        id: string;
    };
}

/**
 * GET Telegram Link Status
 */
router.get('/status', (req: Request, res: Response, next) => authenticate(req, res, next), async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const client = await poolManager.getSystemClient();
  try {
    const result = await client.query(
      'SELECT telegram_chat_id FROM public."user" WHERE id = $1',
      [userId]
    );
    
    const response = {
      isLinked: !!result.rows[0]?.telegram_chat_id,
      chatId: result.rows[0]?.telegram_chat_id || null
    };

    // Validate with Zod before sending
    telegramStatusResponseSchema.parse(response);
    
    res.json(response);
  } catch (error: any) {
    log('error', `Error checking Telegram status: ${error.message}`);
    res.status(500).json({ message: 'Error checking Telegram status' });
  } finally {
    client.release();
  }
});

/**
 * POST Generate Linking Code
 */
router.post('/link-code', (req: Request, res: Response, next) => authenticate(req, res, next), async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  // Generate a random 6-character code
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const client = await poolManager.getSystemClient();
  try {
    await client.query(
      'UPDATE public."user" SET telegram_link_code = $1 WHERE id = $2',
      [code, userId]
    );
    
    const response = { code };
    telegramLinkCodeResponseSchema.parse(response);
    
    res.json(response);
  } catch (error: any) {
    log('error', `Error generating Telegram link code: ${error.message}`);
    res.status(500).json({ message: 'Error generating link code' });
  } finally {
    client.release();
  }
});

/**
 * POST Unlink Telegram
 */
router.post('/unlink', (req: Request, res: Response, next) => authenticate(req, res, next), async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user.id;
  const client = await poolManager.getSystemClient();
  try {
    await client.query(
      'UPDATE public."user" SET telegram_chat_id = NULL, telegram_link_code = NULL WHERE id = $1',
      [userId]
    );
    res.json({ message: 'Telegram account unlinked successfully' });
  } catch (error: any) {
    log('error', `Error unlinking Telegram: ${error.message}`);
    res.status(500).json({ message: 'Error unlinking Telegram' });
  } finally {
    client.release();
  }
});

module.exports = router;
