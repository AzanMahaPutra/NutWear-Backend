const dashboardService = require("../services/dashboardService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");

const getSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getDashboardSummary();
  return successResponse(res, { message: "Ringkasan dashboard berhasil diambil", data: summary });
});

module.exports = { getSummary };
