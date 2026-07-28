const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * UPDATE 7 — disertakan relasi order_items (variant_ukuran, variant_warna,
 * quantity, product_name) supaya Detail Produk bisa menampilkan info
 * pembelian sebenarnya (Nama Produk/Ukuran/Warna/Jumlah Dibeli) pada tiap
 * ulasan. Relasinya lewat reviews.order_item_id -> order_items(id), jadi
 * bernilai null untuk ulasan lama yang belum punya order_item_id.
 */
// UPDATE — Balasan Review oleh Admin: `admin_replier` (alias, lewat FK
// reviews.admin_reply_by -> users.id) menyertakan nama Admin yang membalas,
// dipakai untuk menampilkan "Balasan dari NutWear Official" pada card balasan.
const REVIEW_SELECT_WITH_PURCHASE = `
  *,
  users!reviews_user_id_fkey ( nama_lengkap ),
  order_items ( product_name, variant_ukuran, variant_warna, quantity ),
  admin_replier:users!reviews_admin_reply_by_fkey ( nama_lengkap )
`;

// UPDATE — Moderasi Review: halaman Detail Produk (publik) hanya boleh menampilkan
// review berstatus "ditampilkan". Review yang disembunyikan Admin dianggap tidak
// ada bagi pengunjung, meski tetap tersimpan di database.
async function findByProduct(productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT_WITH_PURCHASE)
    .eq("product_id", productId)
    .eq("status", "ditampilkan")
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * Dipakai halaman Review Admin — menyertakan thumbnail & SKU produk supaya
 * admin tahu persis produk mana yang direview, tanpa perlu buka halaman lain.
 * `rating` opsional untuk filter jumlah bintang (1-5).
 * UPDATE — `productId` opsional untuk filter berdasarkan produk. Filter dilakukan
 * di query database (bukan di frontend) supaya tetap ringan walau jumlah review
 * sudah banyak, dan bisa dipakai bersamaan dengan filter `rating` (keduanya AND).
 *
 * UPDATE — Search & Filter Kategori (Review Admin):
 * - `categoryId` memfilter lewat relasi products (butuh `products!inner` supaya
 *   PostgREST bisa memfilter kolom tabel yang di-embed lewat notasi titik —
 *   pola yang sama persis dengan `findInventory` di stockRepository.js).
 * - `search` mencari berdasarkan Nama Produk (sebagian kata), SKU Produk, ATAU
 *   Nama User — dilakukan lewat 2 query kecil (cari id produk yang cocok nama/
 *   SKU-nya, cari id user yang cocok namanya) lalu satu query utama memakai
 *   `.or("product_id.in.(...),user_id.in.(...)")`. Semua tetap query database
 *   (bukan fetch seluruh review lalu difilter di JavaScript), dan tetap bisa
 *   dipakai bersamaan dengan rating/productId/categoryId (semuanya AND).
 */
async function findAll({ rating, productId, categoryId, search } = {}) {
  let query = supabase
    .from("reviews")
    .select(
      `
      *,
      users!reviews_user_id_fkey ( nama_lengkap ),
      products!inner (
        nama_produk,
        category_id,
        product_images ( image_url, sort_order ),
        product_variants ( sku )
      ),
      order_items ( product_name, variant_ukuran, variant_warna, quantity ),
      admin_replier:users!reviews_admin_reply_by_fkey ( nama_lengkap )
    `
    )
    .order("created_at", { ascending: false });

  if (rating) query = query.eq("rating", rating);
  if (productId) query = query.eq("product_id", productId);
  if (categoryId) query = query.eq("products.category_id", categoryId);

  if (search) {
    const term = `%${search}%`;
    const [productMatches, variantMatches, userMatches] = await Promise.all([
      supabase.from("products").select("id").ilike("nama_produk", term),
      supabase.from("product_variants").select("product_id").ilike("sku", term),
      supabase.from("users").select("id").ilike("nama_lengkap", term),
    ]);
    if (productMatches.error) throw new AppError(productMatches.error.message, 500);
    if (variantMatches.error) throw new AppError(variantMatches.error.message, 500);
    if (userMatches.error) throw new AppError(userMatches.error.message, 500);

    const productIds = Array.from(
      new Set([
        ...(productMatches.data || []).map((p) => p.id),
        ...(variantMatches.data || []).map((v) => v.product_id),
      ])
    );
    const userIds = (userMatches.data || []).map((u) => u.id);

    // Tidak ada produk maupun user yang cocok sama sekali — langsung kembalikan
    // hasil kosong tanpa perlu query utama ke tabel reviews.
    if (productIds.length === 0 && userIds.length === 0) return [];

    const orParts = [];
    if (productIds.length > 0) orParts.push(`product_id.in.(${productIds.join(",")})`);
    if (userIds.length > 0) orParts.push(`user_id.in.(${userIds.join(",")})`);
    query = query.or(orParts.join(","));
  }

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** UPDATE — Manajemen User: total ulasan per user untuk kolom "Total Review"
 * di halaman Manajemen User Admin. Hanya menghitung (head:true), tidak mengambil data. */
async function countByUser(userId) {
  const { count, error } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return count || 0;
}

async function findOne(userId, productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** UPDATE 7 — cek apakah user sudah pernah mengulas produk ini pada pesanan tertentu
 * (satu ulasan per produk per pesanan). Dipakai reviewService.createReview sebelum
 * insert, selain safety-net unique index di database (reviews_order_product_unique). */
async function findByOrderAndProduct(orderId, productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("order_id", orderId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** UPDATE 7 — dipakai reviewService.updateReview untuk memastikan ulasan yang diedit
 * benar milik user yang sedang login (bukan sekadar productId/rating). */
async function findById(id) {
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT_WITH_PURCHASE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create({ userId, productId, orderId, orderItemId, rating, comment }) {
  const { data, error } = await supabase
    .from("reviews")
    .insert({
      user_id: userId,
      product_id: productId,
      order_id: orderId ?? null,
      order_item_id: orderItemId ?? null,
      rating,
      comment,
    })
    .select()
    .single();
  if (error) {
    // Jaring pengaman terakhir kalau ada race condition yang lolos dari pengecekan
    // di reviewService (dua request create bersamaan) — unique index di database
    // (reviews_order_product_unique) akan menolak insert kedua dengan kode 23505.
    if (error.code === "23505") {
      throw new AppError("Anda sudah memberi ulasan untuk produk ini pada pesanan tersebut", 409);
    }
    throw new AppError(error.message, 500);
  }
  return data;
}

/** UPDATE 7 — Edit Ulasan: UPDATE terhadap baris review yang sudah ada, bukan
 * membuat baris baru. Hanya rating & comment yang boleh diubah. */
async function update(id, { rating, comment }) {
  const { data, error } = await supabase
    .from("reviews")
    .update({ rating, comment })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("reviews").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/** UPDATE — Moderasi Review: rata-rata rating & jumlah review yang tampil ke
 * publik hanya dihitung dari review berstatus "ditampilkan". */
async function getAverageRating(productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "ditampilkan");
  if (error) throw new AppError(error.message, 500);
  if (!data.length) return { average: 0, count: 0 };
  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return { average: Number((sum / data.length).toFixed(1)), count: data.length };
}

/** UPDATE — Moderasi Review: mengubah status review (ditampilkan/disembunyikan)
 * tanpa menghapus baris review dari database. */
async function updateStatus(id, status) {
  const { data, error } = await supabase.from("reviews").update({ status }).eq("id", id).select().single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Balasan Review oleh Admin: menyimpan/mengubah balasan resmi Admin
 * untuk satu review. Dipakai baik untuk balasan baru maupun Edit Balasan —
 * keduanya UPDATE terhadap kolom admin_reply* pada baris review yang sama
 * (bukan baris baru), sesuai aturan "setiap review maksimal satu balasan".
 */
async function setAdminReply(id, { message, adminId }) {
  const { data, error } = await supabase
    .from("reviews")
    .update({ admin_reply: message, admin_reply_at: new Date().toISOString(), admin_reply_by: adminId })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** UPDATE — Balasan Review oleh Admin: Hapus Balasan. Review & data lain tetap
 * ada, hanya kolom balasan yang dikosongkan kembali. */
async function removeAdminReply(id) {
  const { data, error } = await supabase
    .from("reviews")
    .update({ admin_reply: null, admin_reply_at: null, admin_reply_by: null })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Card Produk: Rating & Total Terjual.
 * Versi batch dari getAverageRating() di atas — dipakai productService supaya
 * halaman yang menampilkan banyak Card Produk sekaligus (Home, Semua Produk,
 * Kategori, Pencarian, dst.) cukup satu query untuk seluruh produk yang sedang
 * ditampilkan, bukan satu query per produk. Aturan sama persis dengan
 * getAverageRating(): hanya review berstatus "ditampilkan" yang dihitung.
 * Mengembalikan map { [productId]: { average, count } }, hanya untuk produk
 * yang benar-benar sudah punya review (produk tanpa review tidak ada key-nya —
 * pemanggil wajib fallback ke { average: 0, count: 0 }).
 */
async function getAverageRatings(productIds) {
  if (!productIds || productIds.length === 0) return {};
  const { data, error } = await supabase
    .from("reviews")
    .select("product_id, rating")
    .in("product_id", productIds)
    .eq("status", "ditampilkan");
  if (error) throw new AppError(error.message, 500);

  const totals = {};
  data.forEach((row) => {
    const bucket = totals[row.product_id] || { sum: 0, count: 0 };
    bucket.sum += row.rating;
    bucket.count += 1;
    totals[row.product_id] = bucket;
  });

  const result = {};
  Object.keys(totals).forEach((productId) => {
    const { sum, count } = totals[productId];
    result[productId] = { average: Number((sum / count).toFixed(1)), count };
  });
  return result;
}

module.exports = {
  findByProduct,
  findAll,
  countByUser,
  findOne,
  findByOrderAndProduct,
  findById,
  create,
  update,
  deleteById,
  getAverageRating,
  getAverageRatings,
  updateStatus,
  setAdminReply,
  removeAdminReply,
};
