const wishlistService = require("../services/wishlistService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getAll = asyncHandler(async (req, res) => {
  const items = await wishlistService.getWishlist(req.user.id);
  return successResponse(res, { message: "Wishlist berhasil diambil", data: items });
});

const add = asyncHandler(async (req, res) => {
  await wishlistService.addToWishlist(req.user.id, req.body.productId);
  return successResponse(res, { statusCode: 201, message: "Produk berhasil ditambahkan ke wishlist" });
});

const remove = asyncHandler(async (req, res) => {
  await wishlistService.removeFromWishlist(req.user.id, req.params.productId);
  return successResponse(res, { message: "Produk berhasil dihapus dari wishlist" });
});

module.exports = { getAll, add, remove };
