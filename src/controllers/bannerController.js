const bannerService = require("../services/bannerService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/AppError");

const getAll = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  const banners = await bannerService.getBanners({ activeOnly });
  return successResponse(res, { message: "Daftar banner berhasil diambil", data: banners });
});

const create = asyncHandler(async (req, res) => {
  const files = req.files || {};
  if (!files.backgroundImage?.[0]) throw new AppError("Gambar latar banner wajib diupload", 400);

  const banner = await bannerService.createBanner(req.body, files);
  return successResponse(res, { statusCode: 201, message: "Banner berhasil dibuat", data: banner });
});

const update = asyncHandler(async (req, res) => {
  const banner = await bannerService.updateBanner(req.params.id, req.body, req.files || {});
  return successResponse(res, { message: "Banner berhasil diperbarui", data: banner });
});

const remove = asyncHandler(async (req, res) => {
  await bannerService.deleteBanner(req.params.id);
  return successResponse(res, { message: "Banner berhasil dihapus" });
});

const reorder = asyncHandler(async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) throw new AppError("Format urutan banner tidak valid", 400);

  const banners = await bannerService.reorderBanners(order);
  return successResponse(res, { message: "Urutan banner berhasil diperbarui", data: banners });
});

module.exports = { getAll, create, update, remove, reorder };
