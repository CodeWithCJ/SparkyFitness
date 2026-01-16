const express = require('express');
const router = express.Router();
const oidcProviderRepository = require('../models/oidcProviderRepository');
const { log } = require('../config/logging');
const { isAdmin } = require('../middleware/authMiddleware');
const { initializeOidcClient, clearOidcClientCache } = require('../openidRoutes');
const oidcLogoUpload = require('../middleware/oidcLogoUpload');

/**
 * @swagger
 * /oidc-settings:
 *   get:
 *     summary: Get all OIDC Providers (Admin Only)
 *     tags: [External Integrations]
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
 *                 $ref: '#/components/schemas/OidcProvider'
 */
router.get('/', isAdmin, async (req, res) => {
    try {
        const providers = await oidcProviderRepository.getOidcProviders();
        res.json(providers);
    } catch (error) {
        log('error', `Error getting OIDC providers: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving OIDC providers' });
    }
});

/**
 * @swagger
 * /oidc-settings/{id}:
 *   get:
 *     summary: Get a single OIDC Provider by ID (Admin Only)
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: The OIDC provider.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OidcProvider'
 */
router.get('/:id', isAdmin, async (req, res) => {
    try {
        const provider = await oidcProviderRepository.getOidcProviderById(req.params.id);
        if (provider) {
            // Return all data except the decrypted secret for editing purposes
            // The provider object from the repository now includes all fields
            const { encrypted_client_secret, client_secret_iv, client_secret_tag, ...safeProvider } = provider;
            res.json({ ...safeProvider, client_secret: '*****' }); // Use placeholder
        } else {
            res.status(404).json({ message: 'OIDC provider not found' });
        }
    } catch (error) {
        log('error', `Error getting OIDC provider: ${error.message}`);
        res.status(500).json({ message: 'Error retrieving OIDC provider' });
    }
});

/**
 * @swagger
 * /oidc-settings:
 *   post:
 *     summary: Create a new OIDC Provider (Admin Only)
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OidcProvider'
 *     responses:
 *       201:
 *         description: Created successfully.
 */
router.post('/', isAdmin, async (req, res) => {
    try {
        const providerData = req.body;
        if (!providerData.issuer_url || !providerData.client_id || !providerData.redirect_uris || !providerData.scope) {
            log('warn', 'Missing required OIDC provider fields in create request.');
            return res.status(400).json({ message: 'Missing required OIDC provider fields.' });
        }

        const newProvider = await oidcProviderRepository.createOidcProvider(providerData);
        log('info', `OIDC provider created successfully with ID: ${newProvider.id}.`);

        // No need to initialize client here, it will be done on demand
        res.status(201).json({ message: 'OIDC provider created successfully', id: newProvider.id });
    } catch (error) {
        log('error', `Error creating OIDC provider: ${error.message}`);
        res.status(500).json({ message: 'Error creating OIDC provider' });
    }
});

/**
 * @swagger
 * /oidc-settings/{id}:
 *   put:
 *     summary: Update an OIDC Provider (Admin Only)
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OidcProvider'
 *     responses:
 *       200:
 *         description: Updated successfully.
 */
router.put('/:id', isAdmin, async (req, res) => {
    try {
        const providerData = req.body;
        const { id } = req.params;

        if (!providerData.issuer_url || !providerData.client_id || !providerData.redirect_uris || !providerData.scope) {
            log('warn', 'Missing required OIDC provider fields in update request.');
            return res.status(400).json({ message: 'Missing required OIDC provider fields.' });
        }

        const updatedProvider = await oidcProviderRepository.updateOidcProvider(id, providerData);
        log('info', `OIDC provider ${id} updated successfully. Clearing OIDC client cache.`);

        // Clear the specific client from cache so it's re-initialized on next use
        clearOidcClientCache(id);

        res.status(200).json({ message: 'OIDC provider updated successfully', id: updatedProvider.id });
    } catch (error) {
        log('error', `Error updating OIDC provider: ${error.message}`);
        res.status(500).json({ message: 'Error updating OIDC provider' });
    }
});

/**
 * @swagger
 * /oidc-settings/{id}:
 *   delete:
 *     summary: DELETE an OIDC Provider (Admin Only)
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deleted successfully.
 */
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await oidcProviderRepository.deleteOidcProvider(id);
        log('info', `OIDC provider ${id} deleted successfully. Clearing OIDC client cache.`);

        // Clear the client from cache
        clearOidcClientCache(id);

        res.status(200).json({ message: 'OIDC provider deleted successfully' });
    } catch (error) {
        log('error', `Error deleting OIDC provider: ${error.message}`);
        res.status(500).json({ message: 'Error deleting OIDC provider' });
    }
});

/**
 * @swagger
 * /oidc-settings/{id}/logo:
 *   post:
 *     summary: POST a logo for an OIDC Provider (Admin Only)
 *     tags: [External Integrations]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo: { type: 'string', format: 'binary' }
 *     responses:
 *       200:
 *         description: Logo uploaded successfully.
 */
router.post('/:id/logo', isAdmin, oidcLogoUpload.single('logo'), async (req, res) => {
    const { id } = req.params;
    if (!req.file) {
        return res.status(400).json({ message: 'No logo file uploaded.' });
    }

    try {
        const provider = await oidcProviderRepository.getOidcProviderById(id);
        if (!provider) {
            return res.status(404).json({ message: 'Provider not found.' });
        }
        const logoUrl = `/uploads/oidc/${req.file.filename}`;
        const updatedProvider = { ...provider, logo_url: logoUrl };
        await oidcProviderRepository.updateOidcProvider(id, updatedProvider);
        log('info', `Logo for OIDC provider ${id} updated successfully.`);
        res.status(200).json({ message: 'Logo uploaded successfully', logoUrl });
    } catch (error) {
        log('error', `Error uploading logo for OIDC provider ${id}: ${error.message}`);
        res.status(500).json({ message: 'Error uploading logo' });
    }
});

module.exports = router;