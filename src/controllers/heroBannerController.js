const heroBannerService = require("../services/heroBannerService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/AppError");

const getAll = asyncHandler(async (req, res) => {
  const activeOnly = req.query.activeOnly === "true";
  const banners = await heroBannerService.getHeroBanners({ activeOnly });
  return successResponse(res, { message: "Daftar hero banner berhasil diambil", data: banners });
});

const create = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Gambar hero banner wajib diupload", 400);

  const banner = await heroBannerService.createHeroBanner(req.body, req.file);
  return successResponse(res, { statusCode: 201, message: "Hero banner berhasil dibuat", data: banner });
});

const update = asyncHandler(async (req, res) => {
  const banner = await heroBannerService.updateHeroBanner(req.params.id, req.body, req.file ?? null);
  return successResponse(res, { message: "Hero banner berhasil diperbarui", data: banner });
});

const remove = asyncHandler(async (req, res) => {
  await heroBannerService.deleteHeroBanner(req.params.id);
  return successResponse(res, { message: "Hero banner berhasil dihapus" });
});

const reorder = asyncHandler(async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) throw new AppError("Format urutan hero banner tidak valid", 400);

  const banners = await heroBannerService.reorderHeroBanners(order);
  return successResponse(res, { message: "Urutan hero banner berhasil diperbarui", data: banners });
});

module.exports = { getAll, create, update, remove, reorder };
