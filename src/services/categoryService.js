const categoryRepository = require("../repositories/categoryRepository");
const supabaseStorage = require("../storage/supabaseStorage");
const { AppError } = require("../utils/AppError");

function toResponse(category) {
  return {
    id: category.id,
    namaKategori: category.nama_kategori,
    imageUrl: category.image_url ?? null,
    sortOrder: category.sort_order ?? 0,
    createdAt: category.created_at,
  };
}

async function getAllCategories() {
  const categories = await categoryRepository.findAll();
  return categories.map(toResponse);
}

async function getCategoryById(id) {
  const category = await categoryRepository.findById(id);
  if (!category) throw new AppError("Kategori tidak ditemukan", 404);
  return toResponse(category);
}

async function getCategoryRawById(id) {
  const category = await categoryRepository.findById(id);
  if (!category) throw new AppError("Kategori tidak ditemukan", 404);
  return category;
}

async function createCategory({ namaKategori }, imageFile) {
  // Kategori baru ditempatkan di urutan paling akhir (sort_order tertinggi + 1)
  // supaya tidak mengacaukan urutan yang sudah diatur Admin lewat drag & drop.
  const nextSortOrder = await categoryRepository.getNextSortOrder();
  const fields = { nama_kategori: namaKategori, sort_order: nextSortOrder };

  if (imageFile) {
    const uploaded = await supabaseStorage.uploadImage(imageFile.buffer, imageFile.mimetype, "categories");
    fields.image_url = uploaded.publicUrl;
    fields.image_path = uploaded.path;
  }

  const category = await categoryRepository.create(fields);
  return toResponse(category);
}

async function updateCategory(id, { namaKategori }, imageFile, removeImage) {
  const existing = await getCategoryRawById(id);
  const fields = {};

  if (namaKategori) fields.nama_kategori = namaKategori;

  if (imageFile) {
    const uploaded = await supabaseStorage.replaceImage(
      existing.image_path,
      imageFile.buffer,
      imageFile.mimetype,
      "categories"
    );
    fields.image_url = uploaded.publicUrl;
    fields.image_path = uploaded.path;
  } else if (removeImage) {
    if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
    fields.image_url = null;
    fields.image_path = null;
  }

  const category = await categoryRepository.updateById(id, fields);
  return toResponse(category);
}

async function deleteCategory(id) {
  const existing = await getCategoryRawById(id);
  if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
  await categoryRepository.deleteById(id);
  return true;
}

/**
 * Menyimpan urutan kategori baru hasil drag & drop di Category Admin.
 * `order` berisi seluruh kategori beserta sort_order barunya (dihitung dari
 * posisi di UI setelah di-drop). Konsepnya sama seperti reorderBanners yang
 * sudah ada di project (lihat services/bannerService.js).
 */
async function reorderCategories(order) {
  await Promise.all(
    order
      .filter((item) => item && item.id)
      .map((item) => categoryRepository.updateById(item.id, { sort_order: Number(item.sortOrder) }))
  );
  return getAllCategories();
}

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
};
