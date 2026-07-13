const stockService = require("../services/stockService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const adjust = asyncHandler(async (req, res) => {
  const variant = await stockService.adjustStock(req.params.variantId, req.body);
  return successResponse(res, { message: "Stok berhasil disesuaikan", data: variant });
});

const getLogs = asyncHandler(async (req, res) => {
  const logs = await stockService.getStockLogs(req.params.variantId);
  return successResponse(res, { message: "Riwayat stok berhasil diambil", data: logs });
});

module.exports = { adjust, getLogs };
