const express = require("express");
const router = express.Router();

router.use(express.json());

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: System is up and running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 */
router.get("/", async (req, res,) => {
  return res.json({
    status: "UP",
  });
});

module.exports = router;
