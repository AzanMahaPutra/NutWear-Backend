const productService = require("../services/productService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const { AppError } = require("../utils/AppError");
const supabaseStorage = require("../storage/supabaseStorage");

const getAll = asyncHandler(async (req, res) => {
  const { categoryId, search, page, pageSize } = req.query;
  const result = await productService.getProducts({ categoryId, search, page, pageSize });
  return successResponse(res, { message: "Daftar produk berhasil diambil", data: result.items, meta: result.meta });
});

const getById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return successResponse(res, { message: "Detail produk berhasil diambil", data: product });
});

const getBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  return successResponse(res, { message: "Detail produk berhasil diambil", data: product });
});

const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.body);
  return successResponse(res, { statusCode: 201, message: "Produk berhasil dibuat", data: product });
});

const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  return successResponse(res, { message: "Produk berhasil diperbarui", data: product });
});

const remove = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  return successResponse(res, { message: "Produk berhasil dihapus" });
});

const addVariant = asyncHandler(async (req, res) => {
  const variant = await productService.addProductVariant(req.params.id, req.body);
  return successResponse(res, { statusCode: 201, message: "Varian berhasil ditambahkan", data: variant });
});

const updateVariant = asyncHandler(async (req, res) => {
  const variant = await productService.updateProductVariant(req.params.variantId, req.body);
  return successResponse(res, { message: "Varian berhasil diperbarui", data: variant });
});

const removeVariant = asyncHandler(async (req, res) => {
  await productService.removeProductVariant(req.params.variantId);
  return successResponse(res, { message: "Varian berhasil dihapus" });
});

const uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("File gambar wajib diupload", 400);

  const { publicUrl, path } = await supabaseStorage.uploadImage(req.file.buffer, req.file.mimetype, "products");
  const sortOrder = Number(req.body.sortOrder) || 0;
  const warna = req.body.warna || null;
  const image = await productService.addProductImage(req.params.id, {
    imageUrl: publicUrl,
    imagePath: path,
    sortOrder,
    warna,
  });

  return successResponse(res, { statusCode: 201, message: "Gambar produk berhasil diupload", data: image });
});

const removeImage = asyncHandler(async (req, res) => {
  await productService.removeProductImage(req.params.imageId);
  return successResponse(res, { message: "Gambar produk berhasil dihapus" });
});

// --- Fitur Produk dengan Gambar (UPDATE 4). UPDATE 6: Judul Fitur dihapus, ---
// --- fitur sekarang hanya gambar + deskripsi. ---
const addFeature = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError("Gambar fitur wajib diupload", 400);
  if (!req.body.deskripsi) throw new AppError("Deskripsi fitur wajib diisi", 400);

  const { publicUrl, path } = await supabaseStorage.uploadImage(req.file.buffer, req.file.mimetype, "product-features");
  const sortOrder = req.body.sortOrder !== undefined ? Number(req.body.sortOrder) : undefined;
  const feature = await productService.addProductFeature(req.params.id, {
    imageUrl: publicUrl,
    imagePath: path,
    deskripsi: req.body.deskripsi,
    sortOrder,
  });

  return successResponse(res, { statusCode: 201, message: "Fitur produk berhasil ditambahkan", data: feature });
});

const updateFeature = asyncHandler(async (req, res) => {
  const payload = {
    ...(req.body.deskripsi !== undefined && { deskripsi: req.body.deskripsi }),
    ...(req.body.sortOrder !== undefined && { sortOrder: req.body.sortOrder }),
  };

  if (req.file) {
    const { publicUrl, path } = await supabaseStorage.uploadImage(req.file.buffer, req.file.mimetype, "product-features");
    payload.imageUrl = publicUrl;
    payload.imagePath = path;
  }

  const feature = await productService.updateProductFeature(req.params.featureId, payload);
  return successResponse(res, { message: "Fitur produk berhasil diperbarui", data: feature });
});

const removeFeature = asyncHandler(async (req, res) => {
  await productService.removeProductFeature(req.params.featureId);
  return successResponse(res, { message: "Fitur produk berhasil dihapus" });
});

const getPairs = asyncHandler(async (req, res) => {
  const pairs = await productService.getProductPairs(req.params.id);
  return successResponse(res, { message: "Daftar pasangan produk berhasil diambil", data: pairs });
});

const addPair = asyncHandler(async (req, res) => {
  const pairs = await productService.addProductPair(req.params.id, req.body.sku);
  return successResponse(res, { statusCode: 201, message: "Pasangan produk berhasil ditambahkan", data: pairs });
});

const removePair = asyncHandler(async (req, res) => {
  const pairs = await productService.removeProductPair(req.params.id, req.params.pairedProductId);
  return successResponse(res, { message: "Pasangan produk berhasil dihapus", data: pairs });
});

// --- Pasangan Produk per Foto Gallery (UPDATE 3) ---
const getImagePairingContext = asyncHandler(async (req, res) => {
  const context = await productService.getImagePairingContext(req.params.imageId);
  return successResponse(res, { message: "Info foto produk berhasil diambil", data: context });
});

const getImagePairs = asyncHandler(async (req, res) => {
  const pairs = await productService.getProductImagePairs(req.params.imageId);
  return successResponse(res, { message: "Daftar pasangan produk berhasil diambil", data: pairs });
});

const addImagePair = asyncHandler(async (req, res) => {
  const pairs = await productService.addProductImagePair(req.params.imageId, req.body.productId);
  return successResponse(res, { statusCode: 201, message: "Pasangan produk berhasil ditambahkan", data: pairs });
});

const removeImagePair = asyncHandler(async (req, res) => {
  const pairs = await productService.removeProductImagePair(req.params.imageId, req.params.pairedProductId);
  return successResponse(res, { message: "Pasangan produk berhasil dihapus", data: pairs });
});

module.exports = {
  getAll,
  getById,
  getBySlug,
  create,
  update,
  remove,
  addVariant,
  updateVariant,
  removeVariant,
  uploadImage,
  removeImage,
  addFeature,
  updateFeature,
  removeFeature,
  getPairs,
  addPair,
  removePair,
  getImagePairingContext,
  getImagePairs,
  addImagePair,
  removeImagePair,
};
