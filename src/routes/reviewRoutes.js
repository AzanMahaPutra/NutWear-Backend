const express = require("express");
const reviewController = require("../controllers/reviewController");
const { createReviewValidator, updateReviewValidator, updateStatusValidator } = require("../validators/reviewValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole, blockIfBanned } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/product/:productId", reviewController.getByProduct);
// UPDATE — Banned User: user yang dibanned tidak boleh memberi/mengedit ulasan.
router.post("/", requireAuth, blockIfBanned, createReviewValidator, handleValidation, reviewController.create);
// UPDATE 7 — Edit Ulasan (Riwayat Pesanan). Kepemilikan ulasan divalidasi di service.
router.put("/:id", requireAuth, blockIfBanned, updateReviewValidator, handleValidation, reviewController.update);

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
