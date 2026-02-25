const express = require('express');
const router = express.Router();
const { log } = require('../../config/logging');
const globalSettingsRepository = require('../../models/globalSettingsRepository');
const oidcProviderRepository = require('../../models/oidcProviderRepository');

/**
 * @swagger
 * /auth/settings:
 *   get:
 *     summary: Get public authentication settings and available OIDC providers
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Login settings and OIDC providers
 */
router.get('/settings', async (req, res) => {
    try {
        const [globalSettings, providers] = await Promise.all([
            globalSettingsRepository.getGlobalSettings(),
            oidcProviderRepository.getOidcProviders()
        ]);

        // Environment overrides are now handled within globalSettingsRepository.getGlobalSettings()
        const oidcAutoRedirectEnv = process.env.SPARKY_FITNESS_OIDC_AUTO_REDIRECT === 'true';

        const emailEnabled = globalSettings.enable_email_password_login;
        const oidcEnabled = globalSettings.is_oidc_active;

        const activeProviders = providers
            .filter(p => p.is_active)
            .map(p => ({
                id: p.provider_id, // Match what navigate uses
                display_name: p.display_name || p.provider_id,
                logo_url: p.logo_url,
                auto_register: p.auto_register // Expose the flag
            }));

        res.json({
            email: {
                enabled: emailEnabled
            },
            oidc: {
                enabled: oidcEnabled,
                providers: activeProviders,
                auto_redirect: oidcAutoRedirectEnv
            }
        });
    } catch (error) {
        log('error', `[AUTH CORE] Settings Error: ${error.message}`);
        // Fallback safety, considering potential env override
        const forceEmailLogin = process.env.SPARKY_FITNESS_FORCE_EMAIL_LOGIN === 'true';
        const disableEmailLogin = process.env.SPARKY_FITNESS_DISABLE_EMAIL_LOGIN === 'true';
        res.json({
            email: { enabled: forceEmailLogin || !disableEmailLogin },
            oidc: { enabled: process.env.SPARKY_FITNESS_OIDC_AUTH_ENABLED === 'true', providers: [], auto_redirect: false }
        });
    }
});

/**
 * @swagger
 * /auth/mfa-factors:
 *   get:
 *     summary: Get enabled MFA factors for a user by email
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Enabled MFA factors
 *       400:
 *         description: Email is required
 */
router.get('/mfa-factors', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const userRepository = require('../../models/userRepository');
        const user = await userRepository.findUserByEmail(email);

        if (!user) {
            return res.json({ mfa_totp_enabled: false, mfa_email_enabled: false });
        }

        res.json({
            mfa_totp_enabled: user.mfa_totp_enabled || false,
            mfa_email_enabled: user.mfa_email_enabled || false
        });
    } catch (error) {
        log('error', `[AUTH CORE] MFA Factors Error: ${error.message}`);
        res.json({
            mfa_totp_enabled: true,
            mfa_email_enabled: false
        });
    }
});

module.exports = router;
