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
const moodRoutes = require('./routes/moodRoutes'); // Import Mood routes
const fastingRoutes = require('./routes/fastingRoutes'); // Import Fasting routes
const adminRoutes = require('./routes/adminRoutes'); // Import admin routes
const adminAuthRoutes = require('./routes/adminAuthRoutes'); // Import new admin auth routes
const { router: openidRoutes, initializeOidcClient } = require('./openidRoutes');
const oidcSettingsRoutes = require('./routes/oidcSettingsRoutes');
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
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const redoc = require('redoc-express');
const swaggerSpecs = require('./config/swagger');


const app = express();
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

// Log all incoming requests
app.use((req, res, next) => {
  if (req.originalUrl !== "/auth/users/accessible-users") {
    log("debug", `Incoming request: ${req.method} ${req.originalUrl}`);
  }
  next();
});

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

let sessionMiddleware; // Declare sessionMiddleware globally

const configureSessionMiddleware = (pool) => {
  const session = require("express-session");
  const pgSession = require("connect-pg-simple")(session);

  sessionMiddleware = session({
    store: new pgSession({
      pool: pool, // Connection pool
      tableName: "session", // Use a table named 'session'
    }),
    name: "sparky.sid",
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: true,
    rolling: true, // Reset session expiration on every request to keep user logged in
    proxy: true, // Trust the proxy in all environments (like Vite dev server)
    cookie: {
      path: "/", // Ensure cookie is sent for all paths
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      // secure and sameSite will be set dynamically
    },
  });
};

// Initial session middleware configuration
configureSessionMiddleware(getRawOwnerPool());

// Trust the first proxy
app.set("trust proxy", 1);

app.use((req, res, next) => sessionMiddleware(req, res, next));

// Dynamically set cookie properties based on protocol
app.use((req, res, next) => {
  if (req.session && req.protocol === "https") {
    req.session.cookie.secure = true;
    req.session.cookie.sameSite = "none";
  } else if (req.session) {
    req.session.cookie.sameSite = "lax";
  }
  // log('debug', `[Session Debug] Request Protocol: ${req.protocol}, Secure: ${req.secure}, Host: ${req.headers.host}`); // Commented out for less verbose logging
  next();
});

// Apply authentication middleware to all routes except auth
app.use((req, res, next) => {
  // Routes that do not require authentication (e.g., login, register, OIDC flows, health checks)
  const publicRoutes = [
    "/auth/login",
    "/auth/register",
    "/auth/settings",
    "/auth/forgot-password", // Allow password reset request to be public
    "/auth/reset-password", // Allow password reset to be public
    "/auth/mfa", // Allow MFA routes to be public
    "/auth/request-magic-link", // Allow magic link request to be public
    "/auth/magic-link-login", // Allow magic link login to be public
    "/api/health-data",
    "/health",
    "/openid", // All OIDC routes are handled by session, not JWT token
    "/openid/api/me", // Explicitly allow /openid/api/me as a public route for session check
    "/version", // Allow version endpoint to be public
    // "/withings/callback", // Withings OAuth callback will now be handled by /api/withings/callback
  ];

  // Check if the current request path starts with any of the public routes
  const isPublic = publicRoutes.some((route) => req.path.startsWith(route));

  if (req.path.includes("withings")) {
    log("error", `[WITHINGS DEBUG] Path: ${req.path}, IsPublic: ${isPublic}`);
  }

  if (isPublic) {
    log("debug", `Skipping authentication for public route: ${req.path}`);
    return next();
  }

  // Log all requests that reach the authentication middleware
  //log('debug', `Attempting authentication for route: ${req.path}`);

  // For all other routes, apply JWT token authentication
  authenticate(req, res, next);
});

// Rate limiting for authentication-related routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message:
    "Too many authentication attempts from this IP, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all /auth routes
app.use("/auth/", authLimiter);

// Link all routes
app.use("/chat", chatRoutes);
app.use("/foods", foodRoutes);
app.use("/food-entries", foodEntryRoutes); // Add this line
app.use("/food-entry-meals", foodEntryMealRoutes); // New: Mount FoodEntryMeal routes
app.use("/meals", mealRoutes);
app.use("/reports", reportRoutes);
app.use("/user-preferences", preferenceRoutes);
app.use("/preferences/nutrient-display", nutrientDisplayPreferenceRoutes);
app.use("/measurements", measurementRoutes);
app.use("/goals", goalRoutes);
app.use("/user-goals", goalRoutes);
app.use("/goal-presets", goalPresetRoutes);
app.use("/weekly-goal-plans", weeklyGoalPlanRoutes);
app.use("/meal-plan-templates", mealPlanTemplateRoutes);
app.use("/exercises", exerciseRoutes);
app.use("/exercise-entries", exerciseEntryRoutes);
app.use("/exercise-preset-entries", exercisePresetEntryRoutes); // New route
app.use("/freeexercisedb", freeExerciseDBRoutes); // Add freeExerciseDB routes
app.use("/api/health-data", healthDataRoutes);
app.use("/sleep", sleepRoutes);
app.use("/sleep", sleepRoutes); // Add sleep routes
app.use("/auth", authRoutes);
app.use("/user", authRoutes);
app.use("/health", healthRoutes);
app.use("/external-providers", externalProviderRoutes); // Renamed route for generic data providers
app.use("/integrations/garmin", garminRoutes); // Add Garmin integration routes
app.use("/api/withings", withingsRoutes); // Add Withings integration routes
log("info", "Withings routes mounted at /api/withings");
app.use("/integrations/withings/data", withingsDataRoutes); // Add Withings Data routes
app.use("/mood", moodRoutes); // Add Mood routes
app.use("/fasting", fastingRoutes); // Add Fasting routes
app.use("/admin/oidc-settings", oidcSettingsRoutes); // Admin OIDC settings routes
app.use("/admin/global-settings", globalSettingsRoutes);
app.use("/version", versionRoutes); // Version routes
app.use("/admin", adminRoutes); // Add admin routes
app.use("/admin/auth", adminAuthRoutes); // Add admin auth routes
log("debug", "Registering /openid routes");
app.use("/openid", openidRoutes); // Import OpenID routes
app.use("/water-containers", waterContainerRoutes);
app.use("/admin/backup", backupRoutes); // Add backup routes
app.use("/workout-presets", require("./routes/workoutPresetRoutes")); // Add workout preset routes
app.use(
  "/workout-plan-templates",
  require("./routes/workoutPlanTemplateRoutes")
); // Add workout plan template routes
app.use("/review", reviewRoutes);
app.use("/onboarding", onboardingRoutes); // Add onboarding routes
app.use("/custom-nutrients", customNutrientRoutes); // Add custom nutrient routes
app.use("/meal-types", mealTypeRoutes);

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

applyMigrations()
  .then(grantPermissions)
  .then(applyRlsPolicies)
  .then(async () => {
    // OIDC clients are now initialized on-demand, so no startup initialization is needed.

    // Schedule backups after migrations
    scheduleBackups();
    // Schedule Withings syncs after migrations
    scheduleWithingsSyncs();
    scheduleGarminSyncs();

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

module.exports = { configureSessionMiddleware };

// Centralized error handling middleware - MUST be placed after all routes and other middleware
app.use(errorHandler);

// Catch-all for 404 Not Found - MUST be placed after all routes and error handlers
app.use((req, res, next) => {
  // For any unhandled routes, return a JSON 404 response
  res.status(404).json({
    error: "Not Found",
    message: `The requested URL ${req.originalUrl} was not found on this server.`,
  });
});
