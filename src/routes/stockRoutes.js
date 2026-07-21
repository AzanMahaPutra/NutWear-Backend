const express = require("express");
const stockController = require("../controllers/stockController");
const { adjustStockValidator, updateMinimumStockValidator } = require("../validators/stockValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// UPDATE — Notifikasi Stok Menipis untuk Admin. Didaftarkan sebelum route
// ":variantId" supaya path statis "/settings" & "/low-stock" tidak pernah
// tertangkap sebagai parameter variantId.
router.get("/settings", stockController.getSettings);
router.put("/settings", updateMinimumStockValidator, handleValidation, stockController.updateSettings);
router.get("/low-stock", stockController.getLowStock);

router.patch("/:variantId/adjust", adjustStockValidator, handleValidation, stockController.adjust);
router.get("/:variantId/logs", stockController.getLogs);

module.exports = router;
