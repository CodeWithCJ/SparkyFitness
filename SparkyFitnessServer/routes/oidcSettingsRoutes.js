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
 *     summary: Get all OIDC Providers (Admin Only)
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
 *     summary: Get a single OIDC Provider by ID (Admin Only)
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
 *     summary: Create a new OIDC Provider (Admin Only)
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
 *     summary: Update an OIDC Provider (Admin Only)
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
 *     summary: DELETE an OIDC Provider (Admin Only)
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
 *     summary: POST a logo for an OIDC Provider (Admin Only)
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