const cartService = require("../services/cartService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getAll = asyncHandler(async (req, res) => {
  const items = await cartService.getCart(req.user.id);
  return successResponse(res, { message: "Keranjang berhasil diambil", data: items });
});

const add = asyncHandler(async (req, res) => {
  await cartService.addToCart(req.user.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Produk berhasil ditambahkan ke keranjang" });
});

const update = asyncHandler(async (req, res) => {
  const item = await cartService.updateCartItem(req.user.id, req.params.id, req.body.quantity);
  return successResponse(res, { message: "Jumlah item berhasil diperbarui", data: item });
});

const remove = asyncHandler(async (req, res) => {
  await cartService.removeCartItem(req.user.id, req.params.id);
  return successResponse(res, { message: "Item berhasil dihapus dari keranjang" });
});

const clear = asyncHandler(async (req, res) => {
  await cartService.clearCart(req.user.id);
  return successResponse(res, { message: "Keranjang berhasil dikosongkan" });
});

module.exports = { getAll, add, update, remove, clear };
