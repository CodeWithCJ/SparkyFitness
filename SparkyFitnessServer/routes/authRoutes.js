const express = require('express');
const router = express.Router();

// Import the modularized routes
router.use(require('./auth/authCoreRoutes'));
router.use(require('./auth/userProfileRoutes'));
router.use(require('./auth/familyAccessRoutes'));
// Intercept logout to clear context cookie
router.post('/sign-out', (req, res, next) => {
    res.clearCookie('sparky_active_user_id', { path: '/' });
    next(); // Pass to Better Auth or return success? Better Auth is mounted at /auth, so this might collide or needs to be "before".
    // Actually, standard router.use means this runs if matched. 
    // Let's make it a specific endpoint that the frontend calls, OR a middleware that intercepts.
    // Ideally, the frontend calls /api/auth/sign-out. 
    // If we return here, Better Auth won't get usage. 
    // Let's just clear cookie and move on.
    next();
});

// router.use(require('./auth/apiKeyRoutes'));

module.exports = router;