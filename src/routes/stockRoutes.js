const express = require("express");
const stockController = require("../controllers/stockController");
const { adjustStockValidator } = require("../validators/stockValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.patch("/:variantId/adjust", adjustStockValidator, handleValidation, stockController.adjust);
router.get("/:variantId/logs", stockController.getLogs);

module.exports = router;
