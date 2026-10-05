const express = require("express");
const stockController = require("../controllers/stockController");
const {
  adjustStockValidator,
  updateMinimumStockValidator,
  inventoryQueryValidator,
  setStockValidator,
} = require("../validators/stockValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// UPDATE — Notifikasi Stok Menipis untuk Admin & Halaman Inventory Stock Admin.
// Didaftarkan sebelum route ":variantId" supaya path statis ("/settings",
// "/low-stock", "/inventory") tidak pernah tertangkap sebagai parameter variantId.
router.get("/settings", stockController.getSettings);
router.put("/settings", updateMinimumStockValidator, handleValidation, stockController.updateSettings);
router.get("/low-stock", stockController.getLowStock);
router.get("/inventory", inventoryQueryValidator, handleValidation, stockController.getInventory);

router.patch("/:variantId/adjust", adjustStockValidator, handleValidation, stockController.adjust);
// UPDATE — Halaman Inventory Stock Admin: modal Edit Stok + tombol Quick Adjustment.
router.patch("/:variantId/set", setStockValidator, handleValidation, stockController.setStock);
router.get("/:variantId/logs", stockController.getLogs);

module.exports = router;
