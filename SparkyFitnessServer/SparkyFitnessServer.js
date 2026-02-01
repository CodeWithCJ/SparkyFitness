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

// Log all incoming requests - MOVED TO TOP FOR DEBUGGING
app.use((req, res, next) => {
  log("info", `Incoming request: ${req.method} ${req.originalUrl} (Path: ${req.path})`);
  next();
});
try {
  const { auth } = require("./auth");
  const { toNodeHandler } = require("better-auth/node");

  // Block new registrations if disabled via environment variable
  app.use("/auth/sign-up", (req, res, next) => {
    if (process.env.SPARKY_FITNESS_DISABLE_SIGNUP === "true") {
      log("warn", `Blocking registration attempt for ${req.ip} - Sign-up is disabled.`);
      return res.status(403).json({
        error: "Forbidden",
        message: "Sign-up is currently disabled.",
      });
    }
    next();
  });

  // Mount Better Auth handler - Root level catch-all for /auth and /auth/*
  app.all("/auth*", (req, res) => {
    log("debug", `Better Auth handler triggered: ${req.method} ${req.originalUrl}`);
    return toNodeHandler(auth)(req, res);
  });
  log("info", "Better Auth handler mounted at root for /auth*");
} catch (error) {
  log("error", "Error mounting Better Auth routes: " + error.message);
}



// Serve static files from the 'uploads' directory
// This middleware will first try to serve the file if it exists locally.
// If the file is not found, it will fall through to the next middleware,
// which will handle on-demand downloading.
const UPLOADS_BASE_DIR = path.join(__dirname, "uploads");
console.log("SparkyFitnessServer UPLOADS_BASE_DIR:", UPLOADS_BASE_DIR);
app.use("/uploads", express.static(UPLOADS_BASE_DIR));

// On-demand image serving route
app.get(
  "/uploads/exercises/:exerciseId/:imageFileName",
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

      // Use getExerciseBySourceAndSourceId since exerciseId in the URL is actually the source_id
      const exercise = await exerciseRepository.getExerciseBySourceAndSourceId(
        "free-exercise-db",
        exerciseId
      );

      if (!exercise) {
        return res.status(404).send("Exercise not found.");
      }

      // Find the original image path from the exercise's images array
      // The imageFileName is expected to be the last part of the originalRelativeImagePath
      const originalRelativeImagePath = exercise.images.find((img) =>
        img.endsWith(imageFileName)
      );
      log(
        "debug",
        `[SparkyFitnessServer] Original relative image path from DB: ${originalRelativeImagePath}`
      );

      if (!originalRelativeImagePath) {
        return res.status(404).send("Image not found for this exercise.");
      }

      let externalImageUrl;
      // Determine the external image URL based on the source
      if (exercise.source === "free-exercise-db") {
        // Use the originalRelativeImagePath directly as it contains the full path needed by getExerciseImageUrl
        externalImageUrl = freeExerciseDBService.getExerciseImageUrl(
          originalRelativeImagePath
        );
        log(
          "debug",
          `[SparkyFitnessServer] External image URL constructed: ${externalImageUrl}`
        );
      } else {
        // Handle other sources here if needed
        return res
          .status(404)
          .send("Unsupported exercise source for image download.");
      }

      // Download the image
      const { downloadImage } = require("./utils/imageDownloader");
      const downloadedLocalPath = await downloadImage(
        externalImageUrl,
        exerciseId
      );

      // Serve the newly downloaded image
      // downloadedLocalPath already starts with /uploads/exercises/..., so we just need to resolve it from the base directory
      const finalImagePath = path.join(__dirname, downloadedLocalPath);
      log("info", `Serving image from: ${finalImagePath}`);
      res.sendFile(finalImagePath);
    } catch (error) {
      log(
        "error",
        `Error serving or re-downloading image for exercise ${exerciseId}, image ${imageFileName}:`,
        error
      );
      res.status(500).send("Error serving image.");
    }
  }
);



// Log all incoming requests

// Apply authentication middleware to all routes except auth
app.use((req, res, next) => {
  // Routes that do not require authentication (e.g., login, register, OIDC flows, health checks)
  const publicRoutes = [
    "/auth", // Better Auth internal routes
    "/api/auth", // My custom auth routes (settings, etc)
    "/api/health",
    "/api/version",
    "/api/onboarding",
  ];

  // Check if the current request path starts with any of the public routes
  let isPublic = false;
  for (const route of publicRoutes) {
    if (req.path.startsWith(route)) {
      log("debug", `[AUTH DEBUG] req.path: ${req.path} startsWith ${route}: true`);
      isPublic = true;
      break;
    } else {
      log("debug", `[AUTH DEBUG] req.path: ${req.path} startsWith ${route}: false`);
    }
  }

  if (req.path.includes("withings")) {
    log("error", `[WITHINGS DEBUG] Path: ${req.path}, IsPublic: ${isPublic}`);
  }

  if (isPublic) {
    log("debug", `Skipping authentication for public route: ${req.path}. Full path: ${req.originalUrl}`);
    return next();
  }
  log("debug", `Attempting authentication for protected route: ${req.path}. Full path: ${req.originalUrl}`);

  authenticate(req, res, next);
});

// Test route to verify server is up and routing
app.get("/api/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Rate limiting for authentication-related routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased from 100 to prevent blocking during frequent session re-validations
  message:
    "Too many authentication attempts from this IP, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all /auth routes
app.use("/auth/", authLimiter);

// Link all routes
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
app.use("/api/auth", authRoutes); // My custom auth routes
app.use("/api/health", healthRoutes);
app.use("/api/external-providers", externalProviderRoutes);
app.use("/api/integrations/garmin", garminRoutes);
app.use("/api/withings", withingsRoutes);

// Consolidate all system/admin routes here
app.use("/api/version", versionRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/admin/global-settings", globalSettingsRoutes);
app.use("/api/admin/oidc-settings", require("./routes/oidcSettingsRoutes"));
app.use("/api/admin/backup", backupRoutes);
app.use("/api/admin/auth", adminAuthRoutes); // Add Withings integration routes
log("info", "Withings routes mounted at /api/withings");
log("info", "About to mount Withings Data routes");
app.use("/api/integrations/withings/data", withingsDataRoutes);
log("info", "Withings Data routes mounted at /api/integrations/withings/data");
log("info", "About to mount Fitbit routes");
app.use("/api/integrations/fitbit", fitbitRoutes);
log("info", "Fitbit routes mounted at /api/integrations/fitbit");
log("info", "About to mount Mood routes");
app.use("/api/mood", moodRoutes);
log("info", "Mood routes mounted at /api/mood");
log("info", "About to mount Fasting routes");
app.use("/api/fasting", fastingRoutes);
log("info", "Fasting routes mounted at /api/fasting");
log("info", "About to mount Admin routes");
app.use("/api/admin", adminRoutes);
log("info", "Admin routes mounted at /api/admin");
log("info", "About to mount Admin Auth routes");
app.use("/api/admin/auth", adminAuthRoutes);
log("info", "Admin Auth routes mounted at /api/admin/auth");
log("info", "About to mount Water Container routes");
app.use("/api/water-containers", waterContainerRoutes);
log("info", "Water Container routes mounted at /api/water-containers");
log("info", "Backup routes removed from individual mounting - now in consolidated block");
log("info", "About to mount Workout Preset routes");
app.use("/api/workout-presets", require("./routes/workoutPresetRoutes"));
log("info", "Workout Preset routes mounted at /api/workout-presets");
log("info", "About to mount Workout Plan Template routes");
app.use(
  "/api/workout-plan-templates",
  require("./routes/workoutPlanTemplateRoutes")
);
log("info", "Workout Plan Template routes mounted at /api/workout-plan-templates");
log("info", "About to mount Review routes");
app.use("/api/review", reviewRoutes);
log("info", "Review routes mounted at /api/review");
log("info", "About to mount Custom Nutrient routes");
app.use("/api/custom-nutrients", customNutrientRoutes);
log("info", "Custom Nutrient routes mounted at /api/custom-nutrients");
log("info", "About to mount Meal Type routes");
app.use("/api/meal-types", mealTypeRoutes);
log("info", "Meal Type routes mounted at /api/meal-types");

// Consolidated core API routes mounted above
log("info", "All API routes consolidated and mounted under /api");

// --- Better Auth Routes moved up ---

// Serve Swagger UI
app.use('/api-docs/swagger', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Serve Redoc
app.get(
  '/api-docs/redoc',
  redoc({
    title: 'API Docs',
    specUrl: '/api-docs/json',
  })
);

// Serve the raw JSON spec
app.get('/api-docs/json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpecs);
});

// Redirect /api-docs to /api-docs/swagger
app.get('/api-docs', (req, res) => {
  res.redirect('/api-docs/swagger');
});


// Temporary debug route to log incoming requests for meal plan templates
app.use(
  "/meal-plan-templates",
  (req, res, next) => {
    log(
      "debug",
      `[DEBUG ROUTE] Original URL: ${req.originalUrl}, Path: ${req.path}`
    );
    next();
  },
  mealPlanTemplateRoutes
);

console.log("DEBUG: Attempting to start server...");

// Function to schedule backups
const scheduleBackups = async () => {
  // For now, a placeholder. In a later step, we will fetch backup preferences from the DB.
  // Example: Schedule a backup every day at 2 AM
  cron.schedule("0 2 * * *", async () => {
    log("info", "Scheduled backup initiated.");
    const result = await performBackup();
    if (result.success) {
      log("info", `Scheduled backup completed successfully: ${result.path}`);
      // Apply retention policy after successful backup
      await applyRetentionPolicy(7); // Keep 7 days of backups for now
    } else {
      log("error", `Scheduled backup failed: ${result.error}`);
    }
  });
  log("info", "Backup scheduler initialized.");
};

// Function to schedule Withings data synchronization
const scheduleWithingsSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    // Run every hour
    log("info", "Scheduled Withings data sync initiated.");
    try {
      const withingsProviders =
        await externalProviderRepository.getProvidersByType("withings");
      for (const provider of withingsProviders) {
        if (provider.is_active && provider.sync_frequency !== "manual") {
          const userId = provider.user_id;
          const createdByUserId = userId; // Assuming the user is the creator for their own data
          const lastSyncAt = provider.last_sync_at
            ? new Date(provider.last_sync_at)
            : new Date(0); // Default to epoch for first sync
          const now = new Date();

          let shouldSync = false;
          if (
            provider.sync_frequency === "hourly" &&
            now.getTime() - lastSyncAt.getTime() >= 60 * 60 * 1000
          ) {
            shouldSync = true;
          } else if (
            provider.sync_frequency === "daily" &&
            (now.getDate() !== lastSyncAt.getDate() ||
              now.getMonth() !== lastSyncAt.getMonth() ||
              now.getFullYear() !== lastSyncAt.getFullYear())
          ) {
            shouldSync = true;
          }

          if (shouldSync) {
            log(
              "info",
              `Initiating Withings sync for user ${userId} (frequency: ${provider.sync_frequency}).`
            );
            // Fetch data for the last 24 hours or since last sync
            const startDate = Math.floor(lastSyncAt.getTime() / 1000);
            const endDate = Math.floor(now.getTime() / 1000);

            await withingsService.fetchAndProcessMeasuresData(
              userId,
              createdByUserId,
              startDate,
              endDate
            );
            await withingsService.fetchAndProcessHeartData(
              userId,
              createdByUserId,
              startDate,
              endDate
            );
            await withingsService.fetchAndProcessSleepData(
              userId,
              createdByUserId,
              startDate,
              endDate
            );

            // Update last_sync_at
            await externalProviderRepository.updateProviderLastSync(
              provider.id,
              now
            );
            log("info", `Withings sync completed for user ${userId}.`);
          }
        }
      }
    } catch (error) {
      log(
        "error",
        `Error during scheduled Withings data sync: ${error.message}`
      );
    }
  });
  log("info", "Withings sync scheduler initialized.");
};

// Function to schedule Garmin data synchronization
const scheduleGarminSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    // Run every hour
    log("info", "Scheduled Garmin data sync initiated.");
    let providers = [];
    try {
      providers = await externalProviderRepository.getProvidersByType("garmin");
    } catch (error) {
      log(
        "error",
        `Error fetching Garmin providers for hourly sync: ${error.message}`
      );
      return;
    }

    for (const provider of providers) {
      try {
        if (provider.is_active && provider.sync_frequency === "hourly") {
          const userId = provider.user_id;
          const createdByUserId = userId;
          const lastSyncAt = provider.last_sync_at
            ? new Date(provider.last_sync_at)
            : new Date(0);
          const now = new Date();

          if (now.getTime() - lastSyncAt.getTime() >= 60 * 60 * 1000) {
            log("info", `Hourly Garmin sync for user ${userId}`);
            await garminService.syncGarminData(userId, "scheduled");
            await externalProviderRepository.updateProviderLastSync(
              provider.id,
              now
            );
          }
        }
      } catch (error) {
        log(
          "error",
          `Error during hourly Garmin sync for user ${provider.user_id}: ${error.message}`
        );
      }
    }
  });

  cron.schedule("0 2 * * *", async () => {
    // Run every day at 2 AM
    log("info", "Scheduled daily Garmin data sync initiated.");
    let providers = [];
    try {
      providers = await externalProviderRepository.getProvidersByType("garmin");
    } catch (error) {
      log(
        "error",
        `Error fetching Garmin providers for daily sync: ${error.message}`
      );
      return;
    }

    for (const provider of providers) {
      try {
        if (provider.is_active && provider.sync_frequency === "daily") {
          const userId = provider.user_id;
          const createdByUserId = userId;
          const lastSyncAt = provider.last_sync_at
            ? new Date(provider.last_sync_at)
            : new Date(0);
          const now = new Date();

          if (
            now.getDate() !== lastSyncAt.getDate() ||
            now.getMonth() !== lastSyncAt.getMonth() ||
            now.getFullYear() !== lastSyncAt.getFullYear()
          ) {
            log("info", `Daily Garmin sync for user ${userId}`);
            await garminService.syncGarminData(userId, "scheduled");
            await externalProviderRepository.updateProviderLastSync(
              provider.id,
              now
            );
          }
        }
      } catch (error) {
        log(
          "error",
          `Error during daily Garmin sync for user ${provider.user_id}: ${error.message}`
        );
      }
    }
  });

  log("info", "Garmin sync scheduler initialized.");
};

// Function to schedule Fitbit data synchronization
const scheduleFitbitSyncs = async () => {
  cron.schedule("0 * * * *", async () => {
    // Run every hour
    log("info", "Scheduled Fitbit data sync initiated.");
    try {
      const fitbitProviders = await externalProviderRepository.getProvidersByType("fitbit");
      for (const provider of fitbitProviders) {
        if (provider.is_active && provider.sync_frequency !== "manual") {
          const userId = provider.user_id;
          const lastSyncAt = provider.last_sync_at
            ? new Date(provider.last_sync_at)
            : new Date(0);
          const now = new Date();

          let shouldSync = false;
          if (
            provider.sync_frequency === "hourly" &&
            now.getTime() - lastSyncAt.getTime() >= 60 * 60 * 1000
          ) {
            shouldSync = true;
          } else if (
            provider.sync_frequency === "daily" &&
            (now.getDate() !== lastSyncAt.getDate() ||
              now.getMonth() !== lastSyncAt.getMonth() ||
              now.getFullYear() !== lastSyncAt.getFullYear())
          ) {
            shouldSync = true;
          }

          if (shouldSync) {
            log(
              "info",
              `Initiating Fitbit sync for user ${userId} (frequency: ${provider.sync_frequency}).`
            );

            // For scheduled sync, we sync for today
            const today = new Date().toISOString().split('T')[0];

            try {
              // Sync all metrics using the high-level service
              await fitbitService.syncFitbitData(userId, 'scheduled');
              log("info", `Fitbit sync completed for user ${userId}.`);
            } catch (syncError) {
              log("error", `Error syncing Fitbit data for user ${userId}: ${syncError.message}`);
            }
          }
        }
      }
    } catch (error) {
      log(
        "error",
        `Error during scheduled Fitbit data sync: ${error.message}`
      );
    }
  });
  log("info", "Fitbit sync scheduler initialized.");
};

applyMigrations()
  .then(grantPermissions)
  .then(applyRlsPolicies)
  .then(async () => {
    // Schedule backups after migrations
    scheduleBackups();
    // Schedule Withings syncs after migrations
    scheduleWithingsSyncs();
    scheduleGarminSyncs();
    scheduleFitbitSyncs();

    // Set admin user from environment variable if provided
    if (process.env.SPARKY_FITNESS_ADMIN_EMAIL) {
      const userRepository = require("./models/userRepository");
      const adminUser = await userRepository.findUserByEmail(
        process.env.SPARKY_FITNESS_ADMIN_EMAIL
      );
      if (adminUser && adminUser.id) {
        const success = await userRepository.updateUserRole(
          adminUser.id,
          "admin"
        );
        if (success) {
          log(
            "info",
            `User ${process.env.SPARKY_FITNESS_ADMIN_EMAIL} set as admin.`
          );
        } else {
          log(
            "warn",
            `Admin user with email ${process.env.SPARKY_FITNESS_ADMIN_EMAIL} not found.`
          );
        }
      }
    } // Closing the if block for SPARKY_FITNESS_ADMIN_EMAIL

    app.listen(PORT, () => {
      console.log(`DEBUG: Server started and listening on port ${PORT}`); // Direct console log
      log("info", `SparkyFitnessServer listening on port ${PORT}`);
    });
  })
  .catch((error) => {
    log("error", "Failed to apply migrations and start server:", error);
    process.exit(1);
  });

// Centralized error handling middleware - MUST be placed after all routes and other middleware
app.use(errorHandler);

// Catch-all for 404 Not Found - MUST be placed after all routes and error handlers
app.use((req, res, next) => {
  log("warn", `Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: "Not Found",
    message: `The requested URL ${req.originalUrl} was not found on this server.`,
  });
});
