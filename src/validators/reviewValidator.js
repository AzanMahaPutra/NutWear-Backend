const { body } = require("express-validator");

// UPDATE 7 — orderId & orderItemId sekarang wajib: ulasan hanya boleh dibuat dari
// pesanan yang benar-benar berisi produk tersebut (divalidasi lebih lanjut di
// reviewService.createReview).
const createReviewValidator = [
  body("orderId").isUUID().withMessage("orderId tidak valid"),
  body("orderItemId").isUUID().withMessage("orderItemId tidak valid"),
  body("productId").isUUID().withMessage("productId tidak valid"),
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating harus antara 1-5"),
  body("comment").optional().isString().isLength({ max: 1000 }),
];

// UPDATE 7 — Edit Ulasan: hanya rating & comment yang boleh diubah.
const updateReviewValidator = [
  body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating harus antara 1-5"),
  body("comment").optional().isString().isLength({ max: 1000 }),
];

// UPDATE — Moderasi Review: validasi body saat Admin sembunyikan/tampilkan review.
const updateStatusValidator = [
  body("status")
    .isIn(["ditampilkan", "disembunyikan"])
    .withMessage("Status harus 'ditampilkan' atau 'disembunyikan'"),
];

// UPDATE — Review Helpful: validasi body saat user memberi/mengganti vote.
const voteValidator = [
  body("vote").isIn(["membantu", "tidak_membantu"]).withMessage("Vote harus 'membantu' atau 'tidak_membantu'"),
];

// UPDATE — Balasan Review oleh Admin: validasi body saat Admin membalas/mengedit balasan.
const replyValidator = [
  body("message")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Isi balasan wajib diisi")
    .isLength({ max: 1000 })
    .withMessage("Isi balasan maksimal 1000 karakter"),
];

module.exports = {
  createReviewValidator,
  updateReviewValidator,
  updateStatusValidator,
  voteValidator,
  replyValidator,
};
