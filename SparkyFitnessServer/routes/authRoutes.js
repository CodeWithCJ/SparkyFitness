const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // Import jsonwebtoken
const { authenticate, authorize } = require('../middleware/authMiddleware'); // Added authorize
const { JWT_SECRET } = require('../security/encryption'); // Added JWT_SECRET import
const { registerValidation, loginValidation, forgotPasswordValidation, resetPasswordValidation, mfaValidation, emailMfaValidation, verifyRecoveryCodeValidation, magicLinkRequestValidation } = require('../validation/authValidation'); // Added new validations
const { validationResult } = require('express-validator');
const authService = require('../services/authService');
const oidcProviderRepository = require('../models/oidcProviderRepository');
const { log } = require('../config/logging');
const globalSettingsRepository = require('../models/globalSettingsRepository'); // Added globalSettingsRepository
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '../uploads/avatars');
console.log('AuthRoutes UPLOADS_DIR:', UPLOADS_DIR);

// Ensure the uploads directory exists
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExtension = path.extname(file.originalname);
    cb(null, req.userId + '-' + uniqueSuffix + fileExtension);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images (jpeg, jpg, png, gif) are allowed.'));
    }
  }
});

router.use(express.json());

router.post('/login', loginValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    // Determine the effective login settings, including the fallback.
    const settings = await authService.getLoginSettings();
    const providers = await oidcProviderRepository.getOidcProviders();
    const activeOidcProviders = providers.filter(p => p.is_active);
    const isOidcFullyEnabled = settings.oidc.enabled && activeOidcProviders.length > 0;

    if (!settings.email.enabled && !isOidcFullyEnabled) {
      log('warn', 'Login attempt with no methods enabled. Forcing email/password login as a fallback.');
      settings.email.enabled = true;
    }

    const authResult = await authService.loginUser(email, password, settings);

    if (authResult.status === 'MFA_REQUIRED') {
      return res.status(202).json(authResult);
    }

    res.cookie('token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.status(200).json({ message: 'Login successful', userId: authResult.userId, role: authResult.role });
  } catch (error) {
    if (error.message === 'Invalid credentials.' || error.message === 'Email/Password login is disabled.') {
      return res.status(401).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/settings', async (req, res, next) => {
  try {
    const settings = await authService.getLoginSettings();
    const providers = await oidcProviderRepository.getOidcProviders();
    const activeOidcProviders = providers.filter(p => p.is_active);

    // OIDC is considered fully enabled only if the global flag is on AND at least one provider is active.
    const isOidcFullyEnabled = settings.oidc.enabled && activeOidcProviders.length > 0;

    let warning = null;
    // Fallback logic: if both email and OIDC are disabled, force email login.
    if (!settings.email.enabled && !isOidcFullyEnabled) {
      const warningMessage = 'No login methods were enabled. Email/password login has been temporarily enabled as a fallback. Please review the authentication settings.';
      log('warn', warningMessage);
      settings.email.enabled = true;
      warning = warningMessage;
    }

    const loginProviders = {
      email: {
        enabled: settings.email.enabled,
      },
      oidc: {
        enabled: isOidcFullyEnabled,
        providers: activeOidcProviders.map(({ id, display_name, logo_url }) => ({ id, display_name, logo_url })),
      },
      warning, // Include the warning in the response
    };

    res.status(200).json(loginProviders);
  } catch (error) {
    log('error', 'Error fetching login providers settings:', error);
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  const providerId = req.session?.providerId;

  req.session.destroy(async (err) => {
    if (err) {
      return next(err);
    }

    res.clearCookie('sparky.sid');
    res.clearCookie('token');

    // If OIDC user, return end_session_endpoint for frontend to redirect
    if (providerId) {
      try {
        const provider = await oidcProviderRepository.getOidcProviderById(providerId);

        if (provider && provider.end_session_endpoint) {
          const frontendUrl = process.env.SPARKY_FITNESS_FRONTEND_URL || 'http://localhost:3000'; // Fallback for development
          const endSessionUrl = `${provider.end_session_endpoint}?post_logout_redirect_uri=${frontendUrl}/`;
          return res.status(200).json({
            message: 'Logout successful.',
            redirectUrl: endSessionUrl
          });
        } else {
          // Fallback if end_session_endpoint is not discovered
          console.warn(`OIDC end_session_endpoint not found for providerId: ${providerId}. Proceeding with local logout.`);
        }
      } catch (oidcError) {
        // If OIDC provider lookup fails, proceed with local logout
        console.error('Error fetching OIDC provider for logout:', oidcError);
      }
    }

    res.status(200).json({ message: 'Logout successful.' });
  });
});

// Authentication Endpoints
router.post('/register', registerValidation, async (req, res, next) => {
  if (process.env.SPARKY_FITNESS_DISABLE_SIGNUP === 'true') {
    return res.status(403).json({ error: 'New user registration is currently disabled.' });
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, full_name } = req.body;

  try {
    const { userId, token } = await authService.registerUser(email, password, full_name);
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.status(201).json({ message: 'User registered successfully', userId, role: 'user' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'User with this email already exists.' });
    }
    next(error);
  }
});

router.get('/user', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId);
    // Ensure the role is included in the response
    res.status(200).json({
      userId: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at // Include created_at for consistency
    });
  } catch (error) {
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/users/find-by-email', authenticate, async (req, res, next) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email parameter is required.' });
  }

  try {
    const userId = await authService.findUserIdByEmail(email);
    res.status(200).json({ userId });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/user/generate-api-key', authenticate, async (req, res, next) => {
  const { description } = req.body;

  try {
    const apiKey = await authService.generateUserApiKey(req.userId, req.userId, description); // targetUserId is authenticatedUserId
    res.status(201).json({ message: 'API key generated successfully', apiKey });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.delete('/user/api-key/:apiKeyId', authenticate, async (req, res, next) => {
  const { apiKeyId } = req.params;

  try {
    await authService.deleteUserApiKey(req.userId, req.userId, apiKeyId); // targetUserId is authenticatedUserId
    res.status(200).json({ message: 'API key deleted successfully.' });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'API Key not found or not authorized for deletion.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/users/accessible-users', authenticate, async (req, res, next) => {
  try {
    const accessibleUsers = await authService.getAccessibleUsers(req.userId);
    res.status(200).json(accessibleUsers);
  } catch (error) {
    next(error);
  }
});

router.get('/profiles', authenticate, async (req, res, next) => {
  try {
    const profile = await authService.getUserProfile(req.userId, req.userId); // authenticatedUserId is targetUserId
    if (!profile) {
      return res.status(200).json({});
    }
    res.status(200).json(profile);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.put('/profiles', authenticate, async (req, res, next) => {
  const { full_name, phone_number, date_of_birth, bio, avatar_url, gender } = req.body;

  try {
    const updatedProfile = await authService.updateUserProfile(
      req.userId,
      req.userId,
      { full_name, phone_number, date_of_birth, bio, avatar_url, gender }
    ); // authenticatedUserId is targetUserId
    res.status(200).json({ message: 'Profile updated successfully.', profile: updatedProfile });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Profile not found or no changes made.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/user-api-keys', authenticate, async (req, res, next) => {
  try {
    const apiKeys = await authService.getUserApiKeys(req.userId, req.userId); // authenticatedUserId is targetUserId
    res.status(200).json(apiKeys);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/update-password', authenticate, async (req, res, next) => {
  const { newPassword } = req.body;

  if (!newPassword) {
    return res.status(400).json({ error: 'New password is required.' });
  }

  try {
    await authService.updateUserPassword(req.userId, newPassword);
    res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/update-email', authenticate, async (req, res, next) => {
  const { newEmail } = req.body;

  if (!newEmail) {
    return res.status(400).json({ error: 'New email is required.' });
  }

  try {
    await authService.updateUserEmail(req.userId, newEmail);
    res.status(200).json({ message: 'Email update initiated. User will need to verify new email.' });
  } catch (error) {
    if (error.message === 'Email already in use by another account.') {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === 'User not found.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/access/can-access-user-data', authenticate, async (req, res, next) => {
  const { targetUserId, permissionType } = req.query;

  if (!targetUserId || !permissionType) {
    return res.status(400).json({ error: 'targetUserId and permissionType are required.' });
  }

  try {
    const canAccess = await authService.canAccessUserData(targetUserId, permissionType, req.userId);
    res.status(200).json({ canAccess });
  } catch (error) {
    next(error);
  }
});

router.get('/access/check-family-access', authenticate, async (req, res, next) => {
  const { ownerUserId, permission } = req.query;

  if (!ownerUserId || !permission) {
    return res.status(400).json({ error: 'ownerUserId and permission are required.' });
  }

  try {
    const hasAccess = await authService.checkFamilyAccess(req.userId, ownerUserId, permission);
    res.status(200).json({ hasAccess });
  } catch (error) {
    next(error);
  }
});

router.get('/family-access', authenticate, async (req, res, next) => {
  try {
    const authenticatedUserId = req.userId;
    if (!authenticatedUserId) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authenticated user ID not found.' });
    }

    // The RLS policy on the family_access table will ensure that only records
    // where the authenticated user is either the owner_user_id or the family_user_id are returned.
    const entries = await authService.getFamilyAccessEntries(authenticatedUserId);
    res.status(200).json(entries);
  } catch (error) {
    log('error', `Error fetching family access entries:`, error);
    next(error);
  }
});

router.post('/family-access', authenticate, async (req, res, next) => {
  const entryData = req.body;

  if (!entryData.family_user_id || !entryData.family_email || !entryData.access_permissions) {
    return res.status(400).json({ error: 'Family User ID, Family Email, and Access Permissions are required.' });
  }

  try {
    const newEntry = await authService.createFamilyAccessEntry(req.userId, entryData);
    res.status(201).json(newEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

router.put('/family-access/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;
  const updateData = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Family Access ID is required.' });
  }

  try {
    const updatedEntry = await authService.updateFamilyAccessEntry(req.userId, id, updateData);
    res.status(200).json(updatedEntry);
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Family access entry not found or not authorized to update.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.delete('/family-access/:id', authenticate, async (req, res, next) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Family Access ID is required.' });
  }

  try {
    await authService.deleteFamilyAccessEntry(req.userId, id);
    res.status(200).json({ message: 'Family access entry deleted successfully.' });
  } catch (error) {
    if (error.message.startsWith('Forbidden')) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Family access entry not found or not authorized to delete.') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

router.post('/profiles/avatar', authenticate, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      console.error('Multer did not provide a file for upload.');
      return res.status(400).json({ error: 'No file uploaded.' });
    }
    console.log('Multer req.file:', req.file);
    // The file is already saved by multer to the correct location
    // We need to update the user's profile with the new avatar_url,
    // using the authenticated route for serving the avatar.
    const avatarUrl = `/auth/profiles/avatar/${req.file.filename}`;
    console.log('Generated avatarUrl for DB:', avatarUrl);
    await authService.updateUserProfile(req.userId, req.userId, { avatar_url: avatarUrl });
    res.status(200).json({ message: 'Avatar uploaded successfully.', avatar_url: avatarUrl });
  } catch (error) {
    console.error('Error in avatar upload route:', error);
    next(error);
  }
});

router.get('/profiles/avatar/:filename', authenticate, async (req, res, next) => {
  try {
    const { filename } = req.params;
    const userId = req.userId; // Authenticated user ID

    // In a real application, you would verify that the requested avatar
    // belongs to the authenticated user or is publicly accessible.
    // For now, we'll assume the filename contains enough info or is safe.

    const avatarPath = path.join(UPLOADS_DIR, filename);

    // Check if the file exists
    if (fs.existsSync(avatarPath)) {
      res.sendFile(avatarPath);
    } else {
      res.status(404).json({ error: 'Avatar not found.' });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', forgotPasswordValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email } = req.body;

  try {
    await authService.forgotPassword(email);
    res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', resetPasswordValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { token, newPassword } = req.body;

  try {
    await authService.resetPassword(token, newPassword);
    res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    if (error.message === 'Password reset token is invalid or has expired.') {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.get('/mfa/status', authenticate, async (req, res, next) => {
  try {
    const status = await authService.getMfaStatus(req.userId);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/setup/totp', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId);
    const { secret, otpauthUrl } = await authService.generateTotpSecret(user.id, user.email);
    res.status(200).json({ secret, otpauthUrl });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify/totp', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code } = req.body;
  try {
    const isValid = await authService.verifyTotpCode(req.userId, code);
    if (isValid) {
      // If authenticating as part of a login challenge, issue a new JWT token.
      // If this route is hit during MFA setup, the token will just allow proceeding, but the frontend context should handle this distinction.
      const user = await authService.getUser(req.userId); // Fetch user details to create a full login token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });

      // Update MFA settings to mark TOTP as enabled if this is the setup flow,
      // or simply acknowledge verification for login flow.
      await authService.updateUserMfaSettings(req.userId, null, true, null, null, null, null, null);

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      res.status(200).json({ message: 'TOTP verified and login successful.', userId: user.id, email: user.email, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid TOTP code.' });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/enable/totp', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code } = req.body;
  try {
    const isValid = await authService.verifyTotpCode(req.userId, code);
    if (isValid) {
      await authService.updateUserMfaSettings(req.userId, null, true, null, null, null, null, null);
      res.status(200).json({ message: 'TOTP enabled successfully.' });
    } else {
      res.status(401).json({ error: 'Invalid TOTP code.' });
    }
  } catch (error) {
    next(error);
  }
});


router.post('/mfa/disable/totp', authenticate, async (req, res, next) => {
  try {
    // Optionally require password re-authentication here
    await authService.updateUserMfaSettings(req.userId, null, false, null, null, null, null, null);
    res.status(200).json({ message: 'TOTP disabled successfully.' });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/enable/email', authenticate, async (req, res, next) => {
  try {
    await authService.updateUserMfaSettings(req.userId, null, null, true, null, null, null, null);
    res.status(200).json({ message: 'Email MFA enabled successfully.' });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/disable/email', authenticate, async (req, res, next) => {
  try {
    // Optionally require password re-authentication here
    await authService.updateUserMfaSettings(req.userId, null, null, false, null, null, null, null);
    res.status(200).json({ message: 'Email MFA disabled successfully.' });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/request-email-code', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getUser(req.userId); // Get user to send email
    if (!user.mfa_email_enabled) {
      return res.status(400).json({ error: 'Email MFA is not enabled for this user.' });
    }
    const code = await authService.generateEmailMfaCode(req.userId);
    await authService.sendEmailMfaCode(user.email, code);
    res.status(200).json({ message: 'Email MFA code sent.' });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify-email-code', authenticate, mfaValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code, userId: bodyUserId } = req.body; // Extract userId from body for clarity
  try {
    // The userId for verification should come from the authenticated token, not the request body
    // The middleware already sets req.userId from the X-MFA-Token
    const user = await authService.verifyEmailMfaCode(req.userId, code);
    if (user) {
      // After successful email code verification, issue a JWT
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      res.status(200).json({ message: 'Email MFA code verified. Login successful.', userId: user.id, email: user.email, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid or expired email MFA code.' });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/recovery-codes', authenticate, async (req, res, next) => {
  try {
    const codes = await authService.generateRecoveryCodes(req.userId);
    res.status(200).json({ recoveryCodes: codes });
  } catch (error) {
    next(error);
  }
});

router.post('/mfa/verify-recovery-code', verifyRecoveryCodeValidation, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { code, userId } = req.body; // userId is needed if MFA is being verified during initial login

  try {
    const targetUserId = userId; // Use userId from body as it's required by validation
    const isValid = await authService.verifyRecoveryCode(targetUserId, code);
    if (isValid) {
      // Fetch user details to get the role
      const user = await authService.getUser(targetUserId);
      if (!user) {
        return res.status(404).json({ error: 'User not found after recovery code verification.' });
      }
      // After successful recovery code verification, issue a new JWT
      const token = jwt.sign({ userId: targetUserId }, JWT_SECRET, { expiresIn: "30d" });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      res.status(200).json({ message: 'Recovery code verified. Login successful.', userId: targetUserId, role: user.role, token });
    } else {
      res.status(401).json({ error: 'Invalid recovery code.' });
    }
  } catch (error) {
    next(error);
  }
});

// Magic Link routes
router.post('/request-magic-link', magicLinkRequestValidation, async (req, res, next) => {
  log('debug', `Received request for magic link. Body:`, req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    log('warn', `Magic link request validation errors:`, errors.array());
    return res.status(400).json({ errors: errors.array() });
  }
  const { email } = req.body;
  try {
    await authService.requestMagicLink(email);
    log('info', `Magic link requested for email: ${email}`);
    res.status(200).json({ message: 'If an account with that email exists, a magic link has been sent.' });
  } catch (error) {
    log('error', `Error requesting magic link for email ${email}:`, error);
    next(error);
  }
});

router.get('/magic-link-login', async (req, res, next) => {
  const { token } = req.query;
  if (!token) {
    return res.status(400).json({ error: 'Magic link token is missing.' });
  }

  try {
    const authResult = await authService.verifyMagicLink(token);

    // If MFA is required after magic link login
    if (authResult.status === 'MFA_REQUIRED') {
      // Instead of redirecting with query params, send the MFA details in the response
      // The frontend will then navigate using react-router's state
      return res.status(202).json({
        status: 'MFA_REQUIRED',
        userId: authResult.userId,
        email: authResult.email,
        mfa_totp_enabled: authResult.mfa_totp_enabled,
        mfa_email_enabled: authResult.mfa_email_enabled,
        needs_mfa_setup: authResult.needs_mfa_setup,
        mfaToken: authResult.mfaToken,
      });
    }

    res.cookie('token', authResult.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    // Respond with a success message and token to the frontend
    res.status(200).json({
      message: 'Magic link login successful',
      token: authResult.token,
      userId: authResult.userId,
      role: authResult.role, // Assuming role is part of authResult for full login
    });
  } catch (error) {
    log('error', 'Error in magic-link-login route:', error);
    // Send error response to frontend
    res.status(401).json({ error: error.message || 'Magic link login failed.' });
  }
});


module.exports = router;