import express from 'express';
import { getDeploymentCapabilities } from '../utils/runtimeConfig.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json(getDeploymentCapabilities());
});

export default router;
