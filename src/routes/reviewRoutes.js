const express = require("express");
const reviewController = require("../controllers/reviewController");
const {
  createReviewValidator,
  updateReviewValidator,
  updateStatusValidator,
  voteValidator,
  replyValidator,
} = require("../validators/reviewValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole, blockIfBanned, attachUserIfPresent } = require("../middlewares/authMiddleware");

const router = express.Router();

// UPDATE — Review Helpful: attachUserIfPresent (opsional, tidak menolak request
// tanpa token) supaya response bisa menyertakan `myVote` kalau pengunjung
// yang mengakses ternyata sedang login, tanpa mengharuskan login untuk melihat review.
router.get("/product/:productId", attachUserIfPresent, reviewController.getByProduct);
// UPDATE — Banned User: user yang dibanned tidak boleh memberi/mengedit ulasan.
router.post("/", requireAuth, blockIfBanned, createReviewValidator, handleValidation, reviewController.create);
// UPDATE 7 — Edit Ulasan (Riwayat Pesanan). Kepemilikan ulasan divalidasi di service.
router.put("/:id", requireAuth, blockIfBanned, updateReviewValidator, handleValidation, reviewController.update);

// UPDATE — Review Helpful: beri/ganti vote & hapus vote. Wajib login (diarahkan
// ke halaman Login oleh frontend kalau belum), tapi tidak dibatasi blockIfBanned
// karena memberi vote bukan aktivitas transaksi/ulasan baru.
router.post("/:id/vote", requireAuth, voteValidator, handleValidation, reviewController.vote);
router.delete("/:id/vote", requireAuth, reviewController.removeVote);

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

// UPDATE — Balasan Review oleh Admin: kirim balasan baru / edit balasan yang
// sudah ada (endpoint sama — service melakukan UPDATE kolom balasan yang sama),
// dan hapus balasan. Hanya Admin yang boleh mengakses ketiganya.
router.post("/:id/reply", requireAuth, requireRole("admin"), replyValidator, handleValidation, reviewController.reply);
router.delete("/:id/reply", requireAuth, requireRole("admin"), reviewController.deleteReply);

router.delete("/:id", requireAuth, requireRole("admin"), reviewController.remove);

module.exports = router;
