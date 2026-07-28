const reviewService = require("../services/reviewService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

// UPDATE — Review Helpful: req.user hanya terisi kalau user sedang login
// (lewat middleware attachUserIfPresent, opsional — lihat reviewRoutes.js),
// dipakai supaya setiap review bisa menyertakan `myVote` milik user tersebut.
const getByProduct = asyncHandler(async (req, res) => {
  const result = await reviewService.getReviewsByProduct(req.params.productId, req.user?.id);
  return successResponse(res, { message: "Ulasan produk berhasil diambil", data: result.items, meta: result.summary });
});

// UPDATE — Search & Filter Kategori (Review Admin): terima `search` (Nama
// Produk/SKU/Nama User, partial) dan `categoryId` dari query string, dipakai
// bersamaan dengan filter rating & productId yang sudah ada (semuanya AND).
const getAll = asyncHandler(async (req, res) => {
  const rating = req.query.rating ? Number(req.query.rating) : undefined;
  const productId = req.query.productId || undefined;
  const categoryId = req.query.categoryId || undefined;
  const search = req.query.search ? String(req.query.search).trim() || undefined : undefined;
  const reviews = await reviewService.getAllReviews({ rating, productId, categoryId, search });
  return successResponse(res, { message: "Seluruh ulasan berhasil diambil", data: reviews });
});

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Ulasan berhasil dikirim", data: review });
});

// UPDATE 7 — Edit Ulasan: UPDATE terhadap review yang sudah ada (bukan create baru).
const update = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(req.user.id, req.params.id, req.body);
  return successResponse(res, { message: "Ulasan berhasil diperbarui", data: review });
});

const remove = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id);
  return successResponse(res, { message: "Ulasan berhasil dihapus" });
});

// UPDATE — Moderasi Review: Admin menyembunyikan/menampilkan review.
const updateStatus = asyncHandler(async (req, res) => {
  const review = await reviewService.setReviewStatus(req.params.id, req.body.status);
  const message =
    review.status === "disembunyikan" ? "Ulasan berhasil disembunyikan" : "Ulasan berhasil ditampilkan kembali";
  return successResponse(res, { message, data: review });
});

// UPDATE — Review Helpful: user memberi/mengganti vote Membantu/Tidak Membantu.
const vote = asyncHandler(async (req, res) => {
  const result = await reviewService.setVote(req.user.id, req.params.id, req.body.vote);
  return successResponse(res, { message: "Vote berhasil disimpan", data: result });
});

// UPDATE — Review Helpful: user menghapus vote miliknya sendiri.
const removeVote = asyncHandler(async (req, res) => {
  const result = await reviewService.removeVote(req.user.id, req.params.id);
  return successResponse(res, { message: "Vote berhasil dihapus", data: result });
});

// UPDATE — Balasan Review oleh Admin: buat balasan baru ATAU edit balasan
// yang sudah ada (endpoint yang sama, lihat reviewService.replyToReview).
const reply = asyncHandler(async (req, res) => {
  const review = await reviewService.replyToReview(req.user.id, req.params.id, req.body.message);
  return successResponse(res, { message: "Balasan berhasil dikirim", data: review });
});

// UPDATE — Balasan Review oleh Admin: Hapus Balasan.
const deleteReply = asyncHandler(async (req, res) => {
  const review = await reviewService.deleteReply(req.params.id);
  return successResponse(res, { message: "Balasan berhasil dihapus", data: review });
});

module.exports = { getByProduct, getAll, create, update, remove, updateStatus, vote, removeVote, reply, deleteReply };
