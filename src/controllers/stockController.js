const stockService = require("../services/stockService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const adjust = asyncHandler(async (req, res) => {
  const variant = await stockService.adjustStock(req.params.variantId, req.body, req.user.id);
  return successResponse(res, { message: "Stok berhasil disesuaikan", data: variant });
});

const getLogs = asyncHandler(async (req, res) => {
  const logs = await stockService.getStockLogs(req.params.variantId);
  return successResponse(res, { message: "Riwayat stok berhasil diambil", data: logs });
});

// --- UPDATE — Notifikasi Stok Menipis untuk Admin ---
const getSettings = asyncHandler(async (req, res) => {
  const minimumStock = await stockService.getMinimumStock();
  return successResponse(res, { message: "Pengaturan batas minimum stok berhasil diambil", data: { minimumStock } });
});

const updateSettings = asyncHandler(async (req, res) => {
  const minimumStock = await stockService.updateMinimumStock(req.body.minimumStock);
  return successResponse(res, { message: "Batas minimum stok berhasil diperbarui", data: { minimumStock } });
});

const getLowStock = asyncHandler(async (req, res) => {
  const report = await stockService.getLowStockReport();
  return successResponse(res, { message: "Daftar stok menipis berhasil diambil", data: report });
});

// --- UPDATE — Halaman Inventory Stock Admin ---
const getInventory = asyncHandler(async (req, res) => {
  const { search, status, page, pageSize } = req.query;
  const { items, minimumStock, meta } = await stockService.getInventory({ search, status, page, pageSize });
  return successResponse(res, { message: "Daftar Inventory Stock berhasil diambil", data: { items, minimumStock }, meta });
});

const setStock = asyncHandler(async (req, res) => {
  const variant = await stockService.setInventoryStock(req.params.variantId, req.body.stokBaru, req.user.id);
  return successResponse(res, { message: "Stok berhasil diperbarui", data: variant });
});

module.exports = { adjust, getLogs, getSettings, updateSettings, getLowStock, getInventory, setStock };
