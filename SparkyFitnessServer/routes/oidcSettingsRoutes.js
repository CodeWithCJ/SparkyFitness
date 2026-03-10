const express = require('express');
const router = express.Router();
const { log } = require('../config/logging');
const { isAdmin } = require('../middleware/authMiddleware');
const oidcLogoUpload = require('../middleware/oidcLogoUpload');
const oidcProviderRepository = require('../models/oidcProviderRepository');

/**
 * @swagger
 * /admin/oidc-settings:
 *   get:
 *     summary: Get all OIDC providers
 *     tags: [Identity & Security]
 *     description: Returns a list of all configured OIDC providers. Admin only. Client secrets are not included in the response.
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of OIDC providers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     format: uuid
 *                     description: The provider's database ID.
 *                   provider_id:
 *                     type: string
 *                     description: The provider identifier (e.g. "oidc-1234567890").
 *                   issuer_url:
 *                     type: string
 *                     description: The OIDC issuer URL.
 *                   domain:
 *                     type: string
 *                     description: The provider domain.
 *                   client_id:
 *                     type: string
 *                     description: The OAuth client ID.
 *                   scope:
 *                     type: string
 *                     description: OAuth scopes requested.
 *                   is_active:
 *                     type: boolean
 *                     description: Whether the provider is active.
 *                   display_name:
 *                     type: string
 *                     description: Display name for the provider.
 *                   logo_url:
 *                     type: string
 *                     nullable: true
 *                     description: URL to the provider's logo.
 *                   auto_register:
 *                     type: boolean
 *                     description: Whether users are auto-registered on first login.
 *                   redirectURI:
 *                     type: string
 *                     description: The computed callback redirect URI.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 */
router.get('/', isAdmin, async (req, res) => {
    try {
        const providers = await oidcProviderRepository.getOidcProviders();
        res.json(providers);
    } catch (error) {
        log('error', `[OIDC SETTINGS] GET Error: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving OIDC providers' });
    }
});

/**
 * @swagger
 * /admin/oidc-settings/{id}:
 *   get:
 *     summary: Get a single OIDC provider by ID
 *     tags: [Identity & Security]
 *     description: Returns a single OIDC provider including its client secret (masked) and end session endpoint. Admin only.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The provider's database ID.
 *     responses:
 *       200:
 *         description: The OIDC provider details. The client_secret is masked.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
 *                 provider_id:
 *                   type: string
 *                 issuer_url:
 *                   type: string
 *                 domain:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 client_secret:
 *                   type: string
 *                   description: Always masked as "*****".
 *                 scope:
 *                   type: string
 *                 is_active:
 *                   type: boolean
 *                 display_name:
 *                   type: string
 *                 logo_url:
 *                   type: string
 *                   nullable: true
 *                 auto_register:
 *                   type: boolean
 *                 end_session_endpoint:
 *                   type: string
 *                   nullable: true
 *                   description: Logout endpoint from the OIDC discovery document.
 *                 redirectURI:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 *       404:
 *         description: OIDC provider not found.
 */
router.get('/:id', isAdmin, async (req, res) => {
    try {
        const provider = await oidcProviderRepository.getOidcProviderById(req.params.id);
        if (provider) {
            // Mask the secret for display
            provider.client_secret = '*****';
            res.json(provider);
        } else {
            res.status(404).json({ message: 'OIDC provider not found' });
        }
    } catch (error) {
        log('error', `[OIDC SETTINGS] GET/:id Error: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving OIDC provider' });
    }
});

/**
 * @swagger
 * /admin/oidc-settings:
 *   post:
 *     summary: Create a new OIDC provider
 *     tags: [Identity & Security]
 *     description: Creates a new OIDC provider configuration. Admin only.
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - provider_id
 *               - issuer
 *               - client_id
 *               - client_secret
 *             properties:
 *               provider_id:
 *                 type: string
 *                 description: A unique identifier for the provider.
 *               issuer:
 *                 type: string
 *                 description: The OIDC issuer URL.
 *               domain:
 *                 type: string
 *                 description: The provider domain.
 *               client_id:
 *                 type: string
 *                 description: The OAuth client ID.
 *               client_secret:
 *                 type: string
 *                 description: The OAuth client secret.
 *               scopes:
 *                 type: string
 *                 description: OAuth scopes to request.
 *               display_name:
 *                 type: string
 *                 description: Display name for the provider.
 *               is_active:
 *                 type: boolean
 *                 description: Whether the provider should be active.
 *               auto_register:
 *                 type: boolean
 *                 description: Whether to auto-register users on first login.
 *     responses:
 *       201:
 *         description: OIDC provider created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 id:
 *                   type: string
 *                   format: uuid
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 *       500:
 *         description: Server error.
 */
router.post('/', isAdmin, async (req, res) => {
    try {
        const result = await oidcProviderRepository.createOidcProvider(req.body);
        log('info', `[OIDC SETTINGS] Provider created with ID: ${result.id}`);
        res.status(201).json({ message: 'OIDC provider created successfully', id: result.id });
    } catch (error) {
        log('error', `[OIDC SETTINGS] POST Error: ${error.message}`);
        res.status(500).json({ message: 'Error creating OIDC provider: ' + error.message });
    }
});

/**
 * @swagger
 * /admin/oidc-settings/{id}:
 *   put:
 *     summary: Update an OIDC provider
 *     tags: [Identity & Security]
 *     description: Updates an existing OIDC provider configuration. Admin only.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The provider's database ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider_id:
 *                 type: string
 *               issuer:
 *                 type: string
 *               domain:
 *                 type: string
 *               client_id:
 *                 type: string
 *               client_secret:
 *                 type: string
 *               scopes:
 *                 type: string
 *               display_name:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *               auto_register:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: OIDC provider updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 *       500:
 *         description: Server error.
 */
router.put('/:id', isAdmin, async (req, res) => {
    try {
        await oidcProviderRepository.updateOidcProvider(req.params.id, req.body);
        log('info', `[OIDC SETTINGS] Provider ${req.params.id} updated.`);
        res.status(200).json({ message: 'OIDC provider updated successfully' });
    } catch (error) {
        log('error', `[OIDC SETTINGS] PUT Error: ${error.message}`);
        res.status(500).json({ message: 'Error updating OIDC provider: ' + error.message });
    }
});

/**
 * @swagger
 * /admin/oidc-settings/{id}:
 *   delete:
 *     summary: Delete an OIDC provider
 *     tags: [Identity & Security]
 *     description: Permanently deletes an OIDC provider configuration. Admin only.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The provider's database ID.
 *     responses:
 *       200:
 *         description: OIDC provider deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 *       500:
 *         description: Server error.
 */
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        await oidcProviderRepository.deleteOidcProvider(req.params.id);
        res.status(200).json({ message: 'OIDC provider deleted successfully' });
    } catch (error) {
        log('error', `[OIDC SETTINGS] DELETE Error: ${error.message}`);
        res.status(500).json({ message: 'Error deleting OIDC provider' });
    }
});

/**
 * @swagger
 * /admin/oidc-settings/{id}/logo:
 *   post:
 *     summary: Upload a logo for an OIDC provider
 *     tags: [Identity & Security]
 *     description: Uploads a logo image for an OIDC provider. The logo is displayed on the login screen. Admin only.
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The provider's database ID.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - logo
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: The logo image file.
 *     responses:
 *       200:
 *         description: Logo uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 logoUrl:
 *                   type: string
 *                   description: The URL path to the uploaded logo.
 *       400:
 *         description: No logo file uploaded.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. Admin access required.
 *       404:
 *         description: OIDC provider not found.
 *       500:
 *         description: Server error.
 */
router.post('/:id/logo', isAdmin, oidcLogoUpload.single('logo'), async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
        return res.status(400).json({ message: 'No logo file uploaded.' });
    }

    try {
        const logoUrl = `/uploads/oidc/${req.file.filename}`;
        const success = await oidcProviderRepository.setProviderLogo(id, logoUrl);

        if (success) {
            res.status(200).json({ message: 'Logo uploaded successfully', logoUrl });
        } else {
            res.status(404).json({ message: 'OIDC provider not found' });
        }
    } catch (error) {
        log('error', `[OIDC SETTINGS] LOGO Error: ${error.message}`);
        res.status(500).json({ message: 'Error uploading logo' });
    }
});

module.exports = router;