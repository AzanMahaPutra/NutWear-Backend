const reviewService = require("../services/reviewService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getByProduct = asyncHandler(async (req, res) => {
  const result = await reviewService.getReviewsByProduct(req.params.productId);
  return successResponse(res, { message: "Ulasan produk berhasil diambil", data: result.items, meta: result.summary });
});

// UPDATE — Filter Review berdasarkan Produk (Review Admin): terima productId
// dari query string, dipakai bersamaan dengan filter rating yang sudah ada.
const getAll = asyncHandler(async (req, res) => {
  const rating = req.query.rating ? Number(req.query.rating) : undefined;
  const productId = req.query.productId || undefined;
  const reviews = await reviewService.getAllReviews({ rating, productId });
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

module.exports = { getByProduct, getAll, create, update, remove };
