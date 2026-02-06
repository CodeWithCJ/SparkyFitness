const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") }); // Load .env from root directory

// Run pre-flight checks for essential environment variables
const { runPreflightChecks } = require("./utils/preflightChecks");
runPreflightChecks();

const express = require('express');
const cors = require('cors'); // Added this line
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit'); // Import rate-limit
const { getRawOwnerPool } = require('./db/poolManager');
const { log } = require('./config/logging');
const { getDefaultModel } = require('./ai/config');
const { authenticate } = require('./middleware/authMiddleware');
const onBehalfOfMiddleware = require('./middleware/onBehalfOfMiddleware'); // Import the new middleware
const foodRoutes = require('./routes/foodRoutes');
const mealRoutes = require('./routes/mealRoutes');
const foodEntryRoutes = require('./routes/foodEntryRoutes'); // Add this line
const foodEntryMealRoutes = require('./routes/foodEntryMealRoutes'); // New: FoodEntryMeal routes
const reportRoutes = require('./routes/reportRoutes');
const preferenceRoutes = require('./routes/preferenceRoutes');
const nutrientDisplayPreferenceRoutes = require('./routes/nutrientDisplayPreferenceRoutes');
const chatRoutes = require('./routes/chatRoutes');
const measurementRoutes = require('./routes/measurementRoutes');
const goalRoutes = require('./routes/goalRoutes');
const goalPresetRoutes = require('./routes/goalPresetRoutes');
const weeklyGoalPlanRoutes = require('./routes/weeklyGoalPlanRoutes');
const mealPlanTemplateRoutes = require('./routes/mealPlanTemplateRoutes');
const exerciseRoutes = require('./routes/exerciseRoutes');
const exerciseEntryRoutes = require('./routes/exerciseEntryRoutes');
const exercisePresetEntryRoutes = require('./routes/exercisePresetEntryRoutes'); // New import
const freeExerciseDBRoutes = require('./routes/freeExerciseDBRoutes'); // Import freeExerciseDB routes
const healthDataRoutes = require('./integrations/healthData/healthDataRoutes');
const sleepRoutes = require('./routes/sleepRoutes');
const authRoutes = require('./routes/authRoutes');
const healthRoutes = require('./routes/healthRoutes');
const externalProviderRoutes = require('./routes/externalProviderRoutes'); // Renamed import
const garminRoutes = require('./routes/garminRoutes'); // Import Garmin routes
const withingsRoutes = require('./routes/withingsRoutes'); // Import Withings routes
const withingsDataRoutes = require('./routes/withingsDataRoutes'); // Import Withings Data routes
const fitbitRoutes = require('./routes/fitbitRoutes'); // Import Fitbit routes
const moodRoutes = require('./routes/moodRoutes'); // Import Mood routes
const fastingRoutes = require('./routes/fastingRoutes'); // Import Fasting routes
const adminRoutes = require('./routes/adminRoutes'); // Import admin routes
const adminAuthRoutes = require('./routes/adminAuthRoutes'); // Import new admin auth routes
const globalSettingsRoutes = require('./routes/globalSettingsRoutes');
const versionRoutes = require('./routes/versionRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes'); // Import onboarding routes
const customNutrientRoutes = require('./routes/customNutrientRoutes'); // Import custom nutrient routes
const { applyMigrations } = require('./utils/dbMigrations');
const { applyRlsPolicies } = require('./utils/applyRlsPolicies');
const { grantPermissions } = require('./db/grantPermissions');
const waterContainerRoutes = require('./routes/waterContainerRoutes');
const backupRoutes = require('./routes/backupRoutes'); // Import backup routes
const errorHandler = require('./middleware/errorHandler'); // Import the new error handler
const reviewRoutes = require('./routes/reviewRoutes');
const cron = require('node-cron'); // Import node-cron
const { performBackup, applyRetentionPolicy } = require('./services/backupService'); // Import backup service
const externalProviderRepository = require('./models/externalProviderRepository'); // Import externalProviderRepository
const withingsService = require('./integrations/withings/withingsService'); // Import withingsService
const garminConnectService = require('./integrations/garminconnect/garminConnectService'); // Import garminConnectService
const garminService = require('./services/garminService'); // Import garminService
const fitbitService = require('./services/fitbitService'); // Import fitbitService
const mealTypeRoutes = require("./routes/mealTypeRoutes");
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const redoc = require('redoc-express');
const swaggerSpecs = require('./config/swagger');


const app = express();
app.set('trust proxy', 1);  // Trust the first proxy immediately in front of me just internal nginx. external not required.
const PORT = process.env.SPARKY_FITNESS_SERVER_PORT || 3010;

console.log(
  `DEBUG: SPARKY_FITNESS_FRONTEND_URL is: ${process.env.SPARKY_FITNESS_FRONTEND_URL}`
);

// Use cors middleware to allow requests from your frontend
app.use(
  cors({
    origin: process.env.SPARKY_FITNESS_FRONTEND_URL || "http://localhost:8080",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-provider-id",
      "x-api-key",
    ],
    credentials: true, // Allow cookies to be sent from the frontend
  })
);

// Middleware to parse JSON bodies for all incoming requests
// Increased limit to 50mb to accommodate image uploads
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// --- Better Auth Mounting ---
try {
  console.log("[AUTH] Starting Better Auth mounting phase...");
  const { auth } = require("./auth");
  const { toNodeHandler } = require("better-auth/node");
  const betterAuthHandler = toNodeHandler(auth);

  // Catch ALL requests starting with /api/auth early.
  // We use a manual check to avoid Express 5 routing complexities.
  app.use(async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/auth")) {
      // 1. Skip interceptor for discovery routes - let them fall through to authRoutes.js
      const isDiscovery = req.path === "/api/auth/settings" || req.path === "/api/auth/mfa-factors";
      if (isDiscovery) {
        return next();
      }

      // 2. Manual Sign-Out Cleanup: Clear sparky_active_user_id cookie
      if (req.method === "POST" && req.path === "/sign-out") {
        console.log("[AUTH HANDLER] Manual Cleanup: Clearing sparky_active_user_id on logout");
        res.clearCookie('sparky_active_user_id', { path: '/' });
      }

      console.log(`[AUTH HANDLER] Intercepted request: ${req.method} ${req.originalUrl}`);
      return betterAuthHandler(req, res);
    }
    next();
  });
  console.log("[AUTH] Better Auth handler successfully mounted.");
} catch (error) {
  console.error("[AUTH FATAL] Initialization failed:", error);
}

// Log all incoming requests - AFTER auth to see what falls through
app.use((req, res, next) => {
  log("info", `Incoming request: ${req.method} ${req.originalUrl} (Path: ${req.path})`);
  next();
});

// Serve static files from the 'uploads' directory
const UPLOADS_BASE_DIR = path.join(__dirname, "uploads");
console.log("SparkyFitnessServer UPLOADS_BASE_DIR:", UPLOADS_BASE_DIR);
// Mount at both paths for compatibility during transition
app.use("/api/uploads", express.static(UPLOADS_BASE_DIR));
app.use("/uploads", express.static(UPLOADS_BASE_DIR));

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
  ["/api/uploads/exercises/:exerciseId/:imageFileName", "/uploads/exercises/:exerciseId/:imageFileName"],
  async (req, res, next) => {
    const { exerciseId, imageFileName } = req.params;
    const localImagePath = path.join(
      __dirname,
      "uploads/exercises",
      exerciseId,
      imageFileName
    );

    // Check if the file already exists locally
    if (fs.existsSync(localImagePath)) {
      return res.sendFile(localImagePath);
    }

    // If not found, attempt to re-download
    try {
      const exerciseRepository = require("./models/exerciseRepository");
      const freeExerciseDBService = require("./integrations/freeexercisedb/FreeExerciseDBService"); // Import service

      const exercise = await exerciseRepository.getExerciseBySourceAndSourceId(
        "free-exercise-db",
        exerciseId
      );

      if (!exercise) {
        return res.status(404).send("Exercise not found.");
      }

      const originalRelativeImagePath = exercise.images.find((img) =>
        img.endsWith(imageFileName)
      );

      if (!originalRelativeImagePath) {
        return res.status(404).send("Image not found for this exercise.");
      }

      let externalImageUrl = freeExerciseDBService.getExerciseImageUrl(originalRelativeImagePath);

      // Download the image
      const { downloadImage } = require("./utils/imageDownloader");
      const downloadedLocalPath = await downloadImage(
        externalImageUrl,
        exerciseId
      );

      const finalImagePath = path.join(__dirname, downloadedLocalPath);
      res.sendFile(finalImagePath);
    } catch (error) {
      log("error", `Error serving image: ${error.message}`);
      res.status(500).send("Error serving image.");
    }
  }
);

// Apply authentication middleware to all protected routes
app.use((req, res, next) => {
  const publicRoutes = [
    "/api/auth/settings",
    "/api/auth/mfa-factors",
    "/api/health",
    "/api/version",
    "/api/uploads",
    "/uploads",
  ];

  let isPublic = publicRoutes.some(route => {
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
app.get("/api/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Rate limiting for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: "Too many authentication attempts",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/auth", authLimiter);

// Mounting all API routes
app.use("/api/chat", chatRoutes);
app.use("/api/foods", foodRoutes);
app.use("/api/food-entries", foodEntryRoutes);
app.use("/api/food-entry-meals", foodEntryMealRoutes);
app.use("/api/meals", mealRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/user-preferences", preferenceRoutes);
app.use("/api/preferences/nutrient-display", nutrientDisplayPreferenceRoutes);
app.use("/api/measurements", measurementRoutes);
app.use("/api/goals", goalRoutes);
app.use("/api/user-goals", goalRoutes);
app.use("/api/goal-presets", goalPresetRoutes);
app.use("/api/weekly-goal-plans", weeklyGoalPlanRoutes);
app.use("/api/meal-plan-templates", mealPlanTemplateRoutes);
app.use("/api/exercises", exerciseRoutes);
app.use("/api/exercise-entries", exerciseEntryRoutes);
app.use("/api/exercise-preset-entries", exercisePresetEntryRoutes);
app.use("/api/freeexercisedb", freeExerciseDBRoutes);
app.use("/api/health-data", healthDataRoutes);
app.use("/api/sleep", sleepRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/identity", require('./routes/identityRoutes'));
app.use("/api/health", healthRoutes);
app.use("/api/external-providers", externalProviderRoutes);
app.use("/api/integrations/garmin", garminRoutes);
app.use("/api/withings", withingsRoutes);
app.use("/api/version", versionRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/admin/global-settings", globalSettingsRoutes);
app.use("/api/admin/oidc-settings", require("./routes/oidcSettingsRoutes"));
app.use("/api/admin/backup", backupRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/integrations/withings/data", withingsDataRoutes);
app.use("/api/integrations/fitbit", fitbitRoutes);
app.use("/api/mood", moodRoutes);
app.use("/api/fasting", fastingRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/auth", adminAuthRoutes);
app.use("/api/water-containers", waterContainerRoutes);
app.use("/api/workout-presets", require("./routes/workoutPresetRoutes"));
app.use("/api/workout-plan-templates", require("./routes/workoutPlanTemplateRoutes"));
app.use("/api/review", reviewRoutes);
app.use("/api/custom-nutrients", customNutrientRoutes);
app.use("/api/meal-types", mealTypeRoutes);

// Swagger
app.use('/api/api-docs/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));
app.get('/api/api-docs/redoc', redoc({ title: 'API Docs', specUrl: '/api/api-docs/json' }));
app.get('/api/api-docs/json', (req, res) => res.json(swaggerSpecs));
app.get('/api/api-docs', (req, res) => res.redirect('/api/api-docs/swagger'));

// Backup scheduling
const scheduleBackups = async () => {
  cron.schedule("0 2 * * *", async () => {
    const result = await performBackup();
    if (result.success) await applyRetentionPolicy(7);
  });
};

// Session cleanup scheduling
const scheduleSessionCleanup = async () => {
  const { cleanupSessions } = require("./auth");
  // Run every day at 3 AM
  cron.schedule("0 3 * * *", async () => {
    try {
      await cleanupSessions();
    } catch (error) {
      console.error("[CRON] Session cleanup failed:", error);
    }
  });
};

// Withings sync
const scheduleWithingsSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    const withingsProviders = await externalProviderRepository.getProvidersByType("withings");
    for (const provider of withingsProviders) {
      if (provider.is_active && provider.sync_frequency !== "manual") {
        await withingsService.fetchAndProcessMeasuresData(provider.user_id, provider.user_id, Math.floor(Date.now() / 1000) - 3600, Math.floor(Date.now() / 1000));
        await externalProviderRepository.updateProviderLastSync(provider.id, new Date());
      }
    }
  });
};

// Garmin sync
const scheduleGarminSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    const providers = await externalProviderRepository.getProvidersByType("garmin");
    for (const provider of providers) {
      if (provider.is_active && provider.sync_frequency === "hourly") {
        await garminService.syncGarminData(provider.user_id, "scheduled");
        await externalProviderRepository.updateProviderLastSync(provider.id, new Date());
      }
    }
  });
};

// Fitbit sync
const scheduleFitbitSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    const fitbitProviders = await externalProviderRepository.getProvidersByType("fitbit");
    for (const provider of fitbitProviders) {
      if (provider.is_active && provider.sync_frequency !== "manual") {
        await fitbitService.syncFitbitData(provider.user_id, 'scheduled');
        await externalProviderRepository.updateProviderLastSync(provider.id, new Date());
      }
    }
  });
};

applyMigrations()
  .then(grantPermissions)
  .then(applyRlsPolicies)
  .then(async () => {
    scheduleBackups();
    scheduleSessionCleanup();
    scheduleWithingsSyncs();
    scheduleGarminSyncs();
    scheduleFitbitSyncs();

    if (process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      const userRepository = require("./models/userRepository");
      const adminUser = await userRepository.findUserByEmail(process.env.SPARKY_FITNESS_ADMIN_EMAIL);
      if (adminUser) await userRepository.updateUserRole(adminUser.id, "admin");
    }

    app.listen(PORT, () => {
      console.log(`DEBUG: Server started and listening on port ${PORT}`);
      log("info", `SparkyFitnessServer listening on port ${PORT}`);
      console.log('View API documentation at: /api/api-docs/swagger');
    });
  })
  .catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });

app.use(errorHandler);
