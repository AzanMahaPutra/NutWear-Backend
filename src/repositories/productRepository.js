const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const PRODUCT_SELECT = `
  *,
  product_images ( id, image_url, image_path, sort_order, warna, product_image_pairs ( id ) ),
  product_variants ( id, ukuran, warna, sku, stok ),
  product_features ( id, image_url, deskripsi, sort_order )
`;

/**
 * Repository products — query utama menyertakan relasi product_images & product_variants
 * sekaligus (satu round-trip) supaya frontend Detail Produk tidak perlu N+1 request.
 */
async function findAll({ categoryId, search, page = 1, pageSize = 12 } = {}) {
  let query = supabase.from("products").select(PRODUCT_SELECT, { count: "exact" }).eq("is_active", true);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (search) query = query.ilike("nama_produk", `%${search}%`);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new AppError(error.message, 500);
  return { data, total: count };
}

async function findById(id) {
  const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findBySlug(slug) {
  const { data, error } = await supabase.from("products").select(PRODUCT_SELECT).eq("slug", slug).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create(fields) {
  const { data, error } = await supabase
    .from("products")
    .insert({
      category_id: fields.categoryId,
      nama_produk: fields.namaProduk,
      slug: fields.slug,
      harga: fields.harga,
      harga_promo:
        fields.hargaPromo === undefined || fields.hargaPromo === "" || fields.hargaPromo === null
          ? null
          : Number(fields.hargaPromo),
      harga_promo_color: fields.hargaPromoColor || "#dc2626",
      promo_mulai: fields.promoMulai || null,
      promo_selesai: fields.promoSelesai || null,
      is_new_arrival: fields.isNewArrival ?? false,
      gender: fields.gender || "uniseks",
      deskripsi: fields.deskripsi,
      berat: fields.berat,
      is_active: fields.isActive ?? true,
      // UPDATE 5 — Detail Produk dapat Dikelola per Produk (opsional, boleh kosong).
      detail_info: fields.detailInfo || null,
      material_care_info: fields.materialCareInfo || null,
      shipping_return_info: fields.shippingReturnInfo || null,
      production_info: fields.productionInfo || null,
    })
    .select(PRODUCT_SELECT)
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase
    .from("products")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new AppError("Produk tidak dapat dihapus karena masih memiliki relasi data lain.", 409);
    }
    throw new AppError(error.message, 500);
  }
  return true;
}

// --- Product Images ---
async function addImage(productId, { imageUrl, imagePath, sortOrder = 0, warna = null }) {
  const { data, error } = await supabase
    .from("product_images")
    .insert({ product_id: productId, image_url: imageUrl, image_path: imagePath, sort_order: sortOrder, warna })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateImage(imageId, fields) {
  const { data, error } = await supabase.from("product_images").update(fields).eq("id", imageId).select().maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findImageById(imageId) {
  const { data, error } = await supabase.from("product_images").select("*").eq("id", imageId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findColorImage(productId, warna) {
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .eq("warna", warna)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteImage(imageId) {
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * Foto gallery + info produk induknya (nama, slug) — dipakai halaman "Pasangan
 * Produk" untuk menampilkan blok "Produk Utama" (foto yang dipilih user).
 */
async function findImageWithProduct(imageId) {
  const { data, error } = await supabase
    .from("product_images")
    .select(
      `
      id, product_id, image_url, sort_order, warna,
      product:products ( id, nama_produk, slug, harga )
    `
    )
    .eq("id", imageId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

// --- Product Features (UPDATE 4 — Fitur Produk dengan Gambar) ---
// UPDATE 6 — Judul Fitur dihapus dari alur insert; kolom `judul` di database
// tetap ada untuk kompatibilitas data lama tapi tidak lagi diisi di sini.
async function addFeature(productId, { imageUrl, imagePath, deskripsi, sortOrder = 0 }) {
  const { data, error } = await supabase
    .from("product_features")
    .insert({
      product_id: productId,
      image_url: imageUrl,
      image_path: imagePath,
      deskripsi,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findFeatureById(featureId) {
  const { data, error } = await supabase.from("product_features").select("*").eq("id", featureId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findFeaturesByProductId(productId) {
  const { data, error } = await supabase
    .from("product_features")
    .select("*")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateFeature(featureId, fields) {
  const { data, error } = await supabase
    .from("product_features")
    .update(fields)
    .eq("id", featureId)
    .select()
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteFeature(featureId) {
  const { error } = await supabase.from("product_features").delete().eq("id", featureId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

// --- Product Variants ---
async function addVariant(productId, { ukuran, warna, sku, stok }) {
  const { data, error } = await supabase
    .from("product_variants")
    .insert({ product_id: productId, ukuran, warna, sku, stok })
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new AppError("SKU sudah digunakan produk/varian lain", 409);
    throw new AppError(error.message, 500);
  }
  return data;
}

async function updateVariant(variantId, fields) {
  const { data, error } = await supabase.from("product_variants").update(fields).eq("id", variantId).select().maybeSingle();
  if (error) {
    if (error.code === "23505") throw new AppError("SKU sudah digunakan produk/varian lain", 409);
    throw new AppError(error.message, 500);
  }
  return data;
}

async function deleteVariant(variantId) {
  const { error } = await supabase.from("product_variants").delete().eq("id", variantId);
  if (error) {
    if (error.code === "23503") {
      throw new AppError("Varian tidak dapat dihapus karena masih memiliki relasi data lain.", 409);
    }
    throw new AppError(error.message, 500);
  }
  return true;
}

async function findVariantById(variantId) {
  const { data, error } = await supabase.from("product_variants").select("*").eq("id", variantId).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findProductIdBySku(sku) {
  const { data, error } = await supabase.from("product_variants").select("product_id").eq("sku", sku).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data?.product_id ?? null;
}

// --- Product Pairs ---
async function findPairsByProductId(productId) {
  const { data, error } = await supabase
    .from("product_pairs")
    .select(
      `
      id,
      paired_product_id,
      paired_product:products!product_pairs_paired_product_id_fkey (
        id, nama_produk, slug, harga,
        product_images ( id, image_url, sort_order, warna )
      )
    `
    )
    .eq("product_id", productId);
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function createPair(productId, pairedProductId) {
  const { error } = await supabase.from("product_pairs").upsert(
    [
      { product_id: productId, paired_product_id: pairedProductId },
      { product_id: pairedProductId, paired_product_id: productId },
    ],
    { onConflict: "product_id,paired_product_id", ignoreDuplicates: true }
  );
  if (error) throw new AppError(error.message, 500);
  return true;
}

async function deletePair(productId, pairedProductId) {
  const { error } = await supabase
    .from("product_pairs")
    .delete()
    .or(
      `and(product_id.eq.${productId},paired_product_id.eq.${pairedProductId}),and(product_id.eq.${pairedProductId},paired_product_id.eq.${productId})`
    );
  if (error) throw new AppError(error.message, 500);
  return true;
}

// --- Product Image Pairs (UPDATE 3 — pasangan produk per foto Gallery) ---
async function findImagePairsByImageId(imageId) {
  const { data, error } = await supabase
    .from("product_image_pairs")
    .select(
      `
      id,
      paired_product_id,
      paired_product:products!product_image_pairs_paired_product_id_fkey (
        id, nama_produk, slug, harga, harga_promo, harga_promo_color,
        promo_mulai, promo_selesai, is_new_arrival,
        product_images ( id, image_url, sort_order, warna )
      )
    `
    )
    .eq("image_id", imageId)
    .order("created_at", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function createImagePair(imageId, pairedProductId) {
  const { error } = await supabase
    .from("product_image_pairs")
    .upsert(
      [{ image_id: imageId, paired_product_id: pairedProductId }],
      { onConflict: "image_id,paired_product_id", ignoreDuplicates: true }
    );
  if (error) throw new AppError(error.message, 500);
  return true;
}

async function deleteImagePair(imageId, pairedProductId) {
  const { error } = await supabase
    .from("product_image_pairs")
    .delete()
    .eq("image_id", imageId)
    .eq("paired_product_id", pairedProductId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * UPDATE — Card Produk: Rating & Total Terjual.
 * Status yang dihitung sebagai "benar-benar terjual" untuk Total Terjual pada
 * Card Produk: HANYA "sudah_dibayar" dan "selesai" (sesuai dokumen permintaan
 * fitur ini) — TIDAK termasuk diproses/dikemas/dikirim seperti
 * dashboardRepository.PAID_ORDER_STATUSES (yang dipakai untuk Pendapatan/Grafik
 * Penjualan Admin, konteks berbeda). Pending/dibatalkan/expired/gagal juga
 * tidak dihitung.
 */
const SOLD_COUNT_STATUSES = ["sudah_dibayar", "selesai"];

/**
 * Total quantity order_items per produk (hanya order dengan status di atas),
 * dibatch untuk sekumpulan productId sekaligus supaya daftar Card Produk (Home,
 * Semua Produk, Kategori, Pencarian, dst.) tidak melakukan satu query per
 * produk. Mengembalikan map { [productId]: totalQuantity }; produk yang belum
 * pernah terjual tidak punya key-nya (pemanggil fallback ke 0).
 */
async function getSoldCounts(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const { data, error } = await supabase
    .from("order_items")
    .select("product_id, quantity, orders!inner(status)")
    .in("product_id", productIds)
    .in("orders.status", SOLD_COUNT_STATUSES);
  if (error) throw new AppError(error.message, 500);

  const totals = {};
  data.forEach((row) => {
    if (!row.product_id) return;
    totals[row.product_id] = (totals[row.product_id] || 0) + (row.quantity || 0);
  });
  return totals;
}

module.exports = {
  findAll,
  findById,
  findBySlug,
  create,
  updateById,
  deleteById,
  getSoldCounts,
  addImage,
  updateImage,
  findImageById,
  findImageWithProduct,
  findColorImage,
  deleteImage,
  addFeature,
  findFeatureById,
  findFeaturesByProductId,
  updateFeature,
  deleteFeature,
  addVariant,
  updateVariant,
  deleteVariant,
  findVariantById,
  findProductIdBySku,
  findPairsByProductId,
  createPair,
  deletePair,
  findImagePairsByImageId,
  createImagePair,
  deleteImagePair,
};
