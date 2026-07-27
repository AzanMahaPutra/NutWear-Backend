const categoryService = require("../services/categoryService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/AppError");

const getAll = asyncHandler(async (req, res) => {
  const categories = await categoryService.getAllCategories();
  return successResponse(res, { message: "Daftar kategori berhasil diambil", data: categories });
});

const getById = asyncHandler(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.id);
  return successResponse(res, { message: "Detail kategori berhasil diambil", data: category });
});

const create = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body, req.file ?? null);
  return successResponse(res, { statusCode: 201, message: "Kategori berhasil dibuat", data: category });
});

const update = asyncHandler(async (req, res) => {
  const removeImage = req.body.removeImage === "true" || req.body.removeImage === true;
  const category = await categoryService.updateCategory(req.params.id, req.body, req.file ?? null, removeImage);
  return successResponse(res, { message: "Kategori berhasil diperbarui", data: category });
});

const remove = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  return successResponse(res, { message: "Kategori berhasil dihapus" });
});

const reorder = asyncHandler(async (req, res) => {
  const { order } = req.body;
  if (!Array.isArray(order)) throw new AppError("Format urutan kategori tidak valid", 400);

  const categories = await categoryService.reorderCategories(order);
  return successResponse(res, { message: "Urutan kategori berhasil diperbarui", data: categories });
});

module.exports = { getAll, getById, create, update, remove, reorder };
