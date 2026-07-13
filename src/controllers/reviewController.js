const reviewService = require("../services/reviewService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getByProduct = asyncHandler(async (req, res) => {
  const result = await reviewService.getReviewsByProduct(req.params.productId);
  return successResponse(res, { message: "Ulasan produk berhasil diambil", data: result.items, meta: result.summary });
});

const getAll = asyncHandler(async (req, res) => {
  const rating = req.query.rating ? Number(req.query.rating) : undefined;
  const reviews = await reviewService.getAllReviews({ rating });
  return successResponse(res, { message: "Seluruh ulasan berhasil diambil", data: reviews });
});

const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Ulasan berhasil dikirim", data: review });
});

const remove = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.params.id);
  return successResponse(res, { message: "Ulasan berhasil dihapus" });
});

module.exports = { getByProduct, getAll, create, remove };
