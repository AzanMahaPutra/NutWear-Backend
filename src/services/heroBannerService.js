const heroBannerRepository = require("../repositories/heroBannerRepository");
const supabaseStorage = require("../storage/supabaseStorage");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * UPDATE 3 — Perbaikan bug "Hero Banner gagal disimpan".
 *
 * Root cause: createHeroBanner/updateHeroBanner tidak membungkus error dari
 * Supabase Storage (upload gambar) maupun Supabase DB (insert/update). Kalau
 * salah satu langkah itu gagal (mis. bucket storage belum ada/keliru, RLS,
 * kredensial Supabase salah, atau kolom/relasi tidak sesuai), error mentah
 * ikut terlempar ke response, sehingga: (1) admin hanya melihat pesan yang
 * tidak jelas, dan (2) di production, pesan asli tidak konsisten tercatat di
 * log server (lihat perbaikan errorHandler.js) sehingga sulit di-debug.
 *
 * Perbaikan di sini TIDAK menyembunyikan/hardcode kegagalan — proses upload +
 * simpan tetap dijalankan apa adanya. Yang diperbaiki hanya penanganannya:
 * error bisnis/validasi (statusCode < 500, mis. "Gambar wajib diupload")
 * diteruskan apa adanya karena pesannya memang sudah jelas & ramah. Sedangkan
 * error tak terduga (mis. dari Supabase) selalu dicatat lengkap (pesan asli +
 * stack) lewat logger, lalu user tetap diberi pesan yang ramah.
 */
function wrapHeroBannerError(err, action) {
  const isKnownClientError = err instanceof AppError && err.statusCode < 500;
  if (isKnownClientError) return err;

  logger.error(`Gagal ${action} hero banner: ${err.message}`, { stack: err.stack });
  return new AppError(
    `Terjadi kesalahan saat ${action} hero banner. Silakan coba lagi, atau hubungi admin sistem jika masalah berlanjut.`,
    500
  );
}

function toResponse(h) {
  return {
    id: h.id,
    imageUrl: h.image_url,
    title: h.title,
    isActive: h.is_active,
    sortOrder: h.sort_order,
    link: {
      type: h.link_type,
      customUrl: h.custom_url,
      product: h.product
        ? {
            id: h.product.id,
            namaProduk: h.product.nama_produk,
            slug: h.product.slug,
            sku: h.product.product_variants?.[0]?.sku ?? null,
          }
        : null,
      category: h.category ? { id: h.category.id, namaKategori: h.category.nama_kategori } : null,
    },
  };
}

/**
 * Mapping payload camelCase (dari form-data) -> kolom snake_case,
 * hanya menyertakan field yang benar-benar dikirim (partial update aman).
 */
function buildFieldsFromPayload(payload) {
  const str = (key) => (payload[key] !== undefined && payload[key] !== "" ? String(payload[key]) : undefined);
  const nullableStr = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === "" || payload[key] === null ? null : String(payload[key]);
  };
  const num = (key) => (payload[key] !== undefined && payload[key] !== "" ? Number(payload[key]) : undefined);
  const bool = (key) => {
    if (payload[key] === undefined) return undefined;
    return payload[key] === true || payload[key] === "true";
  };

  const linkType = str("linkType");
  const fields = {
    title: nullableStr("title"),
    is_active: bool("isActive"),
    sort_order: num("sortOrder"),
    link_type: linkType,
  };

  // productId/categoryId/customUrl hanya relevan sesuai linkType yang dikirim.
  // Kalau linkType berubah, field tujuan lain otomatis dikosongkan supaya
  // data tidak menyimpan referensi tujuan yang sudah tidak dipakai.
  if (linkType !== undefined) {
    fields.product_id = linkType === "product" ? nullableStr("productId") ?? null : null;
    fields.category_id = linkType === "category" ? nullableStr("categoryId") ?? null : null;
    fields.custom_url = linkType === "custom" ? nullableStr("customUrl") ?? null : null;
  }

  Object.keys(fields).forEach((key) => fields[key] === undefined && delete fields[key]);
  return fields;
}

async function getHeroBanners({ activeOnly } = {}) {
  const banners = await heroBannerRepository.findAll({ activeOnly });
  return banners.map(toResponse);
}

async function getHeroBannerRawById(id) {
  const banner = await heroBannerRepository.findById(id);
  if (!banner) throw new AppError("Hero banner tidak ditemukan", 404);
  return banner;
}

async function getHeroBannerById(id) {
  return toResponse(await getHeroBannerRawById(id));
}

async function createHeroBanner(payload, imageFile) {
  if (!imageFile) throw new AppError("Gambar hero banner wajib diupload", 400);

  try {
    const uploaded = await supabaseStorage.uploadImage(imageFile.buffer, imageFile.mimetype, "hero-banners");

    const fields = buildFieldsFromPayload(payload);
    fields.image_url = uploaded.publicUrl;
    fields.image_path = uploaded.path;
    if (fields.link_type === undefined) fields.link_type = "none";
    if (fields.is_active === undefined) fields.is_active = true;
    if (fields.sort_order === undefined) fields.sort_order = await heroBannerRepository.getNextSortOrder();

    const banner = await heroBannerRepository.create(fields);
    return toResponse(banner);
  } catch (err) {
    throw wrapHeroBannerError(err, "membuat");
  }
}

async function updateHeroBanner(id, payload, imageFile) {
  const existing = await getHeroBannerRawById(id);

  try {
    const fields = buildFieldsFromPayload(payload);

    if (imageFile) {
      const uploaded = await supabaseStorage.replaceImage(
        existing.image_path,
        imageFile.buffer,
        imageFile.mimetype,
        "hero-banners"
      );
      fields.image_url = uploaded.publicUrl;
      fields.image_path = uploaded.path;
    }

    const banner = await heroBannerRepository.updateById(id, fields);
    return toResponse(banner);
  } catch (err) {
    throw wrapHeroBannerError(err, "memperbarui");
  }
}

async function deleteHeroBanner(id) {
  const existing = await getHeroBannerRawById(id);
  if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
  await heroBannerRepository.deleteById(id);
  return true;
}

async function reorderHeroBanners(order) {
  await Promise.all(
    order
      .filter((item) => item && item.id)
      .map((item) => heroBannerRepository.updateById(item.id, { sort_order: Number(item.sortOrder) }))
  );
  return getHeroBanners({});
}

module.exports = {
  getHeroBanners,
  getHeroBannerById,
  createHeroBanner,
  updateHeroBanner,
  deleteHeroBanner,
  reorderHeroBanners,
};
