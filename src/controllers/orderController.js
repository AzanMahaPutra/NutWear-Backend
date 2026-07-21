const orderService = require("../services/orderService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const checkout = asyncHandler(async (req, res) => {
  const order = await orderService.checkout(req.user.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Pesanan berhasil dibuat", data: order });
});

const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.getOrdersByUser(req.user.id);
  return successResponse(res, { message: "Riwayat pesanan berhasil diambil", data: orders });
});

const getMyOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.user.id, req.params.id);
  return successResponse(res, { message: "Detail pesanan berhasil diambil", data: order });
});

// Update 2, poin 1-3 — tombol "Batalkan Pesanan" di Riwayat Pesanan (hanya untuk
// pesanan milik sendiri, hanya selagi status Menunggu Pembayaran).
const cancelMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelOrderByUser(req.user.id, req.params.id);
  return successResponse(res, { message: "Pesanan berhasil dibatalkan", data: order });
});

// Update 1 — tombol "Bayar Sekarang" / "Lanjutkan Pembayaran" di Riwayat Pesanan &
// Detail Pesanan (hanya untuk pesanan milik sendiri, hanya selagi status Menunggu
// Pembayaran). Tidak membuat order/transaksi baru — lihat orderService.continuePayment.
const continueMyOrderPayment = asyncHandler(async (req, res) => {
  const result = await orderService.continuePayment(req.user.id, req.params.id);
  return successResponse(res, { message: "Snap Token berhasil diambil", data: result });
});

// --- Admin ---
const getAllOrders = asyncHandler(async (req, res) => {
  const { date, month, year, status, search } = req.query;
  const orders = await orderService.getAllOrders({ date, month, year, status, search });
  return successResponse(res, { message: "Daftar seluruh pesanan berhasil diambil", data: orders });
});

// UPDATE — Search Order ID: autocomplete dropdown pada Search Bar halaman Pesanan Admin.
const getOrderSearchSuggestions = asyncHandler(async (req, res) => {
  const suggestions = await orderService.getOrderSearchSuggestions(req.query.q);
  return successResponse(res, { message: "Saran pencarian pesanan berhasil diambil", data: suggestions });
});

const getOrderByIdAdmin = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(null, req.params.id, true);
  return successResponse(res, { message: "Detail pesanan berhasil diambil", data: order });
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.id, req.body.status);
  return successResponse(res, { message: "Status pesanan berhasil diperbarui", data: order });
});

const deleteOrder = asyncHandler(async (req, res) => {
  await orderService.deleteOrder(req.params.id);
  return successResponse(res, { message: "Pesanan berhasil dihapus", data: null });
});

const deleteOrdersByFilter = asyncHandler(async (req, res) => {
  const { date, month, year, status } = req.query;
  const deletedCount = await orderService.deleteOrdersByFilter({ date, month, year, status });
  return successResponse(res, {
    message: `${deletedCount} pesanan berhasil dihapus`,
    data: { deletedCount },
  });
});

module.exports = {
  checkout,
  getMyOrders,
  getMyOrderById,
  cancelMyOrder,
  continueMyOrderPayment,
  getAllOrders,
  getOrderSearchSuggestions,
  getOrderByIdAdmin,
  updateStatus,
  deleteOrder,
  deleteOrdersByFilter,
};
