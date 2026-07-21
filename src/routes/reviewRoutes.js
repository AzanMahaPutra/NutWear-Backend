const express = require("express");
const reviewController = require("../controllers/reviewController");
const { createReviewValidator, updateReviewValidator, updateStatusValidator } = require("../validators/reviewValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/product/:productId", reviewController.getByProduct);
router.post("/", requireAuth, createReviewValidator, handleValidation, reviewController.create);
// UPDATE 7 — Edit Ulasan (Riwayat Pesanan). Kepemilikan ulasan divalidasi di service.
router.put("/:id", requireAuth, updateReviewValidator, handleValidation, reviewController.update);

// Admin — moderasi
router.get("/", requireAuth, requireRole("admin"), reviewController.getAll);
// UPDATE — Sembunyikan/Tampilkan review (moderasi tanpa hapus data).
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin"),
  updateStatusValidator,
  handleValidation,
  reviewController.updateStatus
);
router.delete("/:id", requireAuth, requireRole("admin"), reviewController.remove);

module.exports = router;
