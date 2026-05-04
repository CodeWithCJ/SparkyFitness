import path from 'path';

import fs from 'fs';
import express from 'express';
// @ts-expect-error TS7016
import cors from 'cors';
// @ts-expect-error TS7016
import cookieParser from 'cookie-parser';
import { endPool } from './db/poolManager.js';
import { log } from './config/logging.js';
import { authenticate } from './middleware/authMiddleware.js';
import { applySignOutCookieCleanup } from './middleware/signOutCookieCleanup.js';
import foodRoutes from './routes/foodRoutes.js';
// @ts-expect-error TS1192
import v2FoodRoutes from './routes/v2/foodRoutes.js';
// @ts-expect-error TS1192
import v2ExerciseEntryRoutes from './routes/v2/exerciseEntryRoutes.js';
// @ts-expect-error TS1192
import v2ExerciseRoutes from './routes/v2/exerciseRoutes.js';
import mealRoutes from './routes/mealRoutes.js';
import foodEntryRoutes from './routes/foodEntryRoutes.js';
import foodEntryMealRoutes from './routes/foodEntryMealRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import preferenceRoutes from './routes/preferenceRoutes.js';
import nutrientDisplayPreferenceRoutes from './routes/nutrientDisplayPreferenceRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import measurementRoutes from './routes/measurementRoutes.js';
import goalRoutes from './routes/goalRoutes.js';
import goalPresetRoutes from './routes/goalPresetRoutes.js';
// @ts-expect-error TS1192
import goalPresetRoutesV2 from './routes/v2/goalPresetRoutes.js';
import weeklyGoalPlanRoutes from './routes/weeklyGoalPlanRoutes.js';
import mealPlanTemplateRoutes from './routes/mealPlanTemplateRoutes.js';
import exerciseRoutes from './routes/exerciseRoutes.js';
import exerciseEntryRoutes from './routes/exerciseEntryRoutes.js';
import exercisePresetEntryRoutes from './routes/exercisePresetEntryRoutes.js';
import freeExerciseDBRoutes from './routes/freeExerciseDBRoutes.js';
import healthDataRoutes from './integrations/healthData/healthDataRoutes.js';
import sleepRoutes from './routes/sleepRoutes.js';
import sleepScienceRoutes from './routes/sleepScienceRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import externalProviderRoutes from './routes/externalProviderRoutes.js';
import garminRoutes from './routes/garminRoutes.js';
import withingsRoutes from './routes/withingsRoutes.js';
import withingsDataRoutes from './routes/withingsDataRoutes.js';
import fitbitRoutes from './routes/fitbitRoutes.js';
import polarRoutes from './routes/polarRoutes.js';
import stravaRoutes from './routes/stravaRoutes.js';
import hevyRoutes from './routes/hevyRoutes.js';
import moodRoutes from './routes/moodRoutes.js';
import fastingRoutes from './routes/fastingRoutes.js';
import adaptiveTdeeRoutes from './routes/adaptiveTdeeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import globalSettingsRoutes from './routes/globalSettingsRoutes.js';
import versionRoutes from './routes/versionRoutes.js';
import onboardingRoutes from './routes/onboardingRoutes.js';
import customNutrientRoutes from './routes/customNutrientRoutes.js';
import { applyMigrations } from './utils/dbMigrations.js';
import { applyRlsPolicies } from './utils/applyRlsPolicies.js';
import waterContainerRoutes from './routes/waterContainerRoutes.js';
// @ts-expect-error TS1192
import waterIntakeRoutesV2 from './routes/v2/waterIntakeRoutes.js';
import backupRoutes from './routes/backupRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import reviewRoutes from './routes/reviewRoutes.js';
import cron from 'node-cron';
import {
  performBackup,
  applyRetentionPolicy,
} from './services/backupService.js';
import externalProviderRepository from './models/externalProviderRepository.js';
import garminService from './services/garminService.js';
import fitbitService from './services/fitbitService.js';
import polarService from './services/polarService.js';
import stravaService from './services/stravaService.js';
// @ts-expect-error TS1192
import dailySummaryRoutes from './routes/dailySummaryRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import mealTypeRoutes from './routes/mealTypeRoutes.js';
// @ts-expect-error TS7016
import swaggerUi from 'swagger-ui-express';
import redoc from 'redoc-express';
import swaggerSpecs from './config/swagger.js';
import { createCorsOriginChecker } from './utils/corsHelper.js';
import authModule from './auth.js';
import { toNodeHandler } from 'better-auth/node';
import freeExerciseDBService from './integrations/freeexercisedb/FreeExerciseDBService.js';
import { downloadImage } from './utils/imageDownloader.js';
import authRoutes from './routes/authRoutes.js';
import identityRoutes from './routes/identityRoutes.js';
import oidcSettingsRoutes from './routes/oidcSettingsRoutes.js';
import adminAuthRoutes from './routes/adminAuthRoutes.js';
import workoutPresetRoutes from './routes/workoutPresetRoutes.js';
import workoutPlanTemplateRoutes from './routes/workoutPlanTemplateRoutes.js';
import { cleanupSessions } from './auth.js';
import withingsServiceCentral from './services/withingsService.js';
import { upsertEnvOidcProvider } from './utils/oidcEnvConfig.js';
import userRepository from './models/userRepository.js';

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Trust the first proxy immediately in front of me just internal nginx. external not required.
const PORT = process.env.SPARKY_FITNESS_SERVER_PORT || 3010;
console.log(
  `DEBUG: SPARKY_FITNESS_FRONTEND_URL is: ${process.env.SPARKY_FITNESS_FRONTEND_URL}`
);
const allowPrivateNetworks = process.env.ALLOW_PRIVATE_NETWORK_CORS === 'true';
if (allowPrivateNetworks) {
  console.warn(
    '[SECURITY] Private network CORS is ENABLED. Ensure this is only on self-hosted/private networks.'
  );
}
// Use cors middleware to allow requests from your frontend (and optionally private networks)
// Use cors middleware with dynamic configuration to allow Referer fallback (essential for HTTP IPs)
app.use(
  // @ts-expect-error TS7006
  cors((req, callback) => {
    const originChecker = createCorsOriginChecker(
      process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:8080',
      allowPrivateNetworks,
      process.env.SPARKY_FITNESS_EXTRA_TRUSTED_ORIGINS
    );
    const origin = req.header('Origin');
    originChecker(
      origin,
      // @ts-expect-error TS7006
      (_err, allowed) => {
        callback(null, {
          origin: allowed,
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: [
            'Content-Type',
            'Authorization',
            'x-provider-id',
            'x-api-key',
            'x-client-id',
            'x-requested-with',
          ],
          credentials: true,
          maxAge: 86400,
        });
      },
      req
    );
  })
);
// Middleware to parse JSON bodies for all incoming requests
// Increased limit to 50mb to accommodate image uploads
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
// --- Better Auth Mounting Logic (Moved to after migrations) ---
// @ts-expect-error TS7034
let syncTrustedProviders;
// @ts-expect-error TS7034
let betterAuthHandlerInstance = null;
const mountBetterAuth = () => {
  try {
    console.log('[AUTH] Starting Better Auth mounting phase...');
    const { auth } = authModule;
    syncTrustedProviders = authModule.syncTrustedProviders;
    betterAuthHandlerInstance = toNodeHandler(auth);
    console.log('[AUTH] Better Auth handler successfully mounted.');
  } catch (error) {
    console.error('[AUTH FATAL] Initialization failed:', error);
    throw error; // Propagate to block startup if auth fails
  }
};
// Catch ALL requests starting with /api/auth early.
app.use(async (req, res, next) => {
  // @ts-expect-error TS7005
  if (req.originalUrl.startsWith('/api/auth') && betterAuthHandlerInstance) {
    // 1. Skip interceptor for discovery routes - let them fall through to authRoutes.js
    const isDiscovery =
      req.path === '/api/auth/settings' || req.path === '/api/auth/mfa-factors';
    if (isDiscovery) {
      return next();
    }

    // 2. Manual Sign-Out Cleanup: preserve sparky_active_user_id delete
    // cookie across Better Auth's own Set-Cookie writes.
    if (req.method === 'POST' && req.path === '/api/auth/sign-out') {
      console.log(
        '[AUTH HANDLER] Manual Cleanup: Clearing sparky_active_user_id on logout'
      );
      applySignOutCookieCleanup(res);
    }
    console.log(
      `[AUTH HANDLER] Intercepted request: ${req.method} ${req.originalUrl}`
    );
    return betterAuthHandlerInstance(req, res);
  }
  next();
});
// Log all incoming requests - AFTER auth to see what falls through
app.use((req, _res, next) => {
  log(
    'info',
    `Incoming request: ${req.method} ${req.originalUrl} (Path: ${req.path})`
  );
  next();
});
// Serve static files from the 'uploads' directory
const UPLOADS_BASE_DIR = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY
  ? path.resolve(process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY)
  : path.join(__dirname, 'uploads');

console.log('SparkyFitnessServer UPLOADS_BASE_DIR:', UPLOADS_BASE_DIR);
// Mount at both paths for compatibility during transition
app.use('/api/uploads', express.static(UPLOADS_BASE_DIR));
app.use('/uploads', express.static(UPLOADS_BASE_DIR));
// On-demand image serving route
/**
 * @swagger
 * /uploads/exercises/{exerciseId}/{imageFileName}:
 *   get:
 *     summary: serve exercise images
 *     tags: [Utility]
 *     parameters:
 *       - in: path
 *         name: exerciseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the exercise.
 *       - in: path
 *         name: imageFileName
 *         required: true
 *         schema:
 *           type: string
 *         description: The filename of the image.
 *     responses:
 *       200:
 *         description: The image file.
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Image not found.
 *       500:
 *         description: Server error.
 */
app.get(
  [
    '/api/uploads/exercises/:exerciseId/:imageFileName',
    '/uploads/exercises/:exerciseId/:imageFileName',
  ],
  async (req, res, _next) => {
    const { exerciseId, imageFileName } = req.params;
    const localImagePath = path.join(
      UPLOADS_BASE_DIR,
      'exercises',
      // @ts-expect-error TS2345
      exerciseId,
      imageFileName
    );
    // Check if the file already exists locally
    if (fs.existsSync(localImagePath)) {
      return res.sendFile(localImagePath);
    }
    // If not found, attempt to re-download. Resolve image paths from the
    // upstream free-exercise-db record (the canonical source) rather than a
    // per-user DB copy — different users may have locally diverged the images
    // array, and this route is unauthenticated so we have no user context.
    try {
      const exercise = await freeExerciseDBService.getExerciseById(exerciseId);
      if (!exercise) {
        return res.status(404).send('Exercise not found.');
      }
      const originalRelativeImagePath = (
        (exercise as { images?: string[] }).images ?? []
      ).find((img) => path.basename(img) === imageFileName);
      if (!originalRelativeImagePath) {
        return res.status(404).send('Image not found for this exercise.');
      }
      const externalImageUrl = freeExerciseDBService.getExerciseImageUrl(
        originalRelativeImagePath
      );
      await downloadImage(externalImageUrl, exerciseId);
      res.sendFile(localImagePath);
    } catch (error) {
      // @ts-expect-error TS18046
      log('error', `Error serving image: ${error.message}`);
      res.status(500).send('Error serving image.');
    }
  }
);
// Apply authentication middleware to all protected routes
app.use((req, res, next) => {
  const publicRoutes = [
    '/api/auth/settings',
    '/api/auth/mfa-factors',
    '/api/health',
    '/api/version',
    '/api/uploads',
    '/uploads',
    '/api/ping',
  ];
  const isPublic = publicRoutes.some((route) => {
    // Exact match or subpath match with trailing slash to prevent partial matches
    // e.g. "/api/health" matches "/api/health" and "/api/health/" but NOT "/api/health-data"
    // e.g. "/api/onboarding" matches "/api/onboarding" and "/api/onboarding/step1"
    if (req.path === route || req.path.startsWith(route + '/')) {
      return true;
    }
    return false;
  });
  if (isPublic) {
    return next();
  }
  authenticate(req, res, next);
});
// Test route
app.get('/api/ping', (_req, res) =>
  res.json({ status: 'ok', time: new Date().toISOString() })
);
// Mounting all API routes
app.use('/api/chat', chatRoutes);
app.use('/api/foods', foodRoutes);
app.use('/api/v2/foods', v2FoodRoutes);
app.use('/api/v2/exercise-entries', v2ExerciseEntryRoutes);
app.use('/api/v2/exercises', v2ExerciseRoutes);
app.use('/api/food-entries', foodEntryRoutes);
app.use('/api/food-entry-meals', foodEntryMealRoutes);
app.use('/api/meals', mealRoutes);
app.use('/api/daily-summary', dailySummaryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/user-preferences', preferenceRoutes);
app.use('/api/preferences/nutrient-display', nutrientDisplayPreferenceRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/user-goals', goalRoutes);
app.use('/api/goal-presets', goalPresetRoutes);
app.use('/api/v2/goal-presets', goalPresetRoutesV2);
app.use('/api/weekly-goal-plans', weeklyGoalPlanRoutes);
app.use('/api/meal-plan-templates', mealPlanTemplateRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/exercise-entries', exerciseEntryRoutes);
app.use('/api/exercise-preset-entries', exercisePresetEntryRoutes);
app.use('/api/freeexercisedb', freeExerciseDBRoutes);
app.use('/api/health-data', healthDataRoutes);
app.use('/api/sleep', sleepRoutes);
app.use('/api/sleep-science', sleepScienceRoutes);
app.use('/api/auth', (req, res, next) => authRoutes(req, res, next));
app.use('/api/identity', (req, res, next) => identityRoutes(req, res, next));
app.use('/api/health', healthRoutes);
app.use('/api/external-providers', externalProviderRoutes);
app.use('/api/integrations/garmin', garminRoutes);
app.use('/api/withings', withingsRoutes);
app.use('/api/version', versionRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/admin/global-settings', globalSettingsRoutes);
app.use('/api/global-settings', globalSettingsRoutes); // Public route for allow-user-ai-config
app.use('/api/admin/oidc-settings', oidcSettingsRoutes);
app.use('/api/admin/backup', backupRoutes);
app.use('/api/integrations/withings/data', withingsDataRoutes);
app.use('/api/integrations/fitbit', fitbitRoutes);
app.use('/api/integrations/polar', polarRoutes);
app.use('/api/integrations/strava', stravaRoutes);
app.use('/api/integrations/hevy', hevyRoutes);
app.use('/api/mood', moodRoutes);
app.use('/api/fasting', fastingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/auth', (req, res, next) => adminAuthRoutes(req, res, next));
app.use('/api/water-containers', waterContainerRoutes);
app.use('/api/v2/measurements', waterIntakeRoutesV2);
app.use('/api/workout-presets', workoutPresetRoutes);
app.use('/api/workout-plan-templates', workoutPlanTemplateRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/custom-nutrients', customNutrientRoutes);
app.use('/api/adaptive-tdee', adaptiveTdeeRoutes);
app.use('/api/meal-types', mealTypeRoutes);
// Swagger
app.use(
  '/api/api-docs/swagger',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpecs)
);
app.get(
  '/api/api-docs/redoc',
  // @ts-expect-error TS2349
  redoc({ title: 'API Docs', specUrl: '/api/api-docs/json' })
);
app.get('/api/api-docs/json', (_req, res) => res.json(swaggerSpecs));
app.get('/api/api-docs', (_req, res) => res.redirect('/api/api-docs/swagger'));
// Backup scheduling
const scheduleBackups = async () => {
  cron.schedule('0 2 * * *', async () => {
    const result = await performBackup();
    // @ts-expect-error TS2554
    if (result.success) await applyRetentionPolicy(7);
  });
};
// Session cleanup scheduling
const scheduleSessionCleanup = async () => {
  // Run every day at 3 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      await cleanupSessions();
    } catch (error) {
      console.error('[CRON] Session cleanup failed:', error);
    }
  });
};
// Withings sync
const scheduleWithingsSyncs = async () => {
  cron.schedule('0 * * * *', async () => {
    const withingsProviders =
      await externalProviderRepository.getProvidersByType('withings');
    for (const provider of withingsProviders) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        try {
          await withingsServiceCentral.syncWithingsData(
            provider.user_id,
            'scheduled'
          );
          await externalProviderRepository.updateProviderLastSync(
            provider.id,
            new Date()
          );
        } catch (error) {
          console.error(
            `[CRON] Withings sync failed for user ${provider.user_id}:`,
            error
          );
        }
      }
    }
  });
};
// Garmin sync
const scheduleGarminSyncs = async () => {
  cron.schedule('0 * * * *', async () => {
    const providers =
      await externalProviderRepository.getProvidersByType('garmin');
    for (const provider of providers) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        try {
          await garminService.syncGarminData(provider.user_id, 'scheduled');
          await externalProviderRepository.updateProviderLastSync(
            provider.id,
            new Date()
          );
        } catch (error) {
          console.error(
            `[CRON] Garmin sync failed for user ${provider.user_id}:`,
            error
          );
        }
      }
    }
  });
};
// Fitbit sync
const scheduleFitbitSyncs = async () => {
  cron.schedule('0 * * * *', async () => {
    const fitbitProviders =
      await externalProviderRepository.getProvidersByType('fitbit');
    for (const provider of fitbitProviders) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        await fitbitService.syncFitbitData(provider.user_id, 'scheduled');
        await externalProviderRepository.updateProviderLastSync(
          provider.id,
          new Date()
        );
      }
    }
  });
};
// Strava sync
const scheduleStravaSyncs = async () => {
  cron.schedule('0 * * * *', async () => {
    const stravaProviders =
      await externalProviderRepository.getProvidersByType('strava');
    for (const provider of stravaProviders) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        try {
          await stravaService.syncStravaData(provider.user_id, 'scheduled');
          await externalProviderRepository.updateProviderLastSync(
            provider.id,
            new Date()
          );
        } catch (error) {
          console.error(
            `[CRON] Strava sync failed for user ${provider.user_id}:`,
            error
          );
        }
      }
    }
  });
};
// Polar sync
const schedulePolarSyncs = async () => {
  cron.schedule('0 * * * *', async () => {
    const polarProviders =
      await externalProviderRepository.getProvidersByType('polar');
    for (const provider of polarProviders) {
      if (provider.is_active && provider.sync_frequency !== 'manual') {
        try {
          await polarService.syncPolarData(
            provider.user_id,
            'scheduled',
            provider.id
          );
          await externalProviderRepository.updateProviderLastSync(
            provider.id,
            new Date()
          );
        } catch (error) {
          console.error(
            `[CRON] Polar sync failed for user ${provider.user_id}:`,
            error
          );
        }
      }
    }
  });
};
applyMigrations()
  .then(applyRlsPolicies)
  .then(async () => {
    // Upsert OIDC provider from env when SPARKY_FITNESS_OIDC_ISSUER_URL + CLIENT_ID + SECRET + PROVIDER_SLUG are set
    try {
      await upsertEnvOidcProvider();
    } catch (err) {
      log('error', 'OIDC env provider upsert failed:', err);
    }
    mountBetterAuth();
    // Sync trusted SSO providers after database is ready (so Better Auth sees env-upserted and DB providers)
    // @ts-expect-error TS7005
    if (syncTrustedProviders) {
      // @ts-expect-error TS7006
      await syncTrustedProviders().catch((err) =>
        console.error('[AUTH] Post-init SSO sync failed:', err)
      );
    }
    scheduleBackups();
    scheduleSessionCleanup();
    scheduleWithingsSyncs();
    scheduleGarminSyncs();
    scheduleFitbitSyncs();
    schedulePolarSyncs();
    scheduleStravaSyncs();
    if (process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      const adminUser = await userRepository.findUserByEmail(
        process.env.SPARKY_FITNESS_ADMIN_EMAIL
      );
      if (adminUser) await userRepository.updateUserRole(adminUser.id, 'admin');
    }
    const server = app.listen(PORT, () => {
      console.log(`DEBUG: Server started and listening on port ${PORT}`);
      log('info', `SparkyFitnessServer listening on port ${PORT}`);
      console.log('View API documentation at: /api/api-docs/swagger');
    });
    // Fix for reverse proxies using HTTP keepalive (e.g. Traefik, Caddy)
    server.keepAliveTimeout = 181000; // Must be > proxy's idle timeout (nginx=75s, traefik=default 180s)
    server.headersTimeout = 182000; // Must be slightly > keepAliveTimeout
    // Graceful shutdown
    let shuttingDown = false;
    // @ts-expect-error TS7006
    const shutdown = async (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      log('info', `${signal} received, shutting down gracefully...`);
      server.close(async () => {
        log('info', 'HTTP server closed, draining database pools...');
        try {
          await endPool();
          log('info', 'Database pools closed. Exiting.');
        } catch (err) {
          log('error', 'Error closing database pools:', err);
        }
        // eslint-disable-next-line n/no-process-exit
        process.exit(0);
      });
      // Force exit if graceful shutdown takes too long
      setTimeout(() => {
        log('error', 'Graceful shutdown timed out after 15s, forcing exit.');
        // eslint-disable-next-line n/no-process-exit
        process.exit(1);
      }, 15000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exitCode = 1;
  });
app.use(errorHandler);
