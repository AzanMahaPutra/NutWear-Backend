const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * UPDATE 7 — disertakan relasi order_items (variant_ukuran, variant_warna,
 * quantity, product_name) supaya Detail Produk bisa menampilkan info
 * pembelian sebenarnya (Nama Produk/Ukuran/Warna/Jumlah Dibeli) pada tiap
 * ulasan. Relasinya lewat reviews.order_item_id -> order_items(id), jadi
 * bernilai null untuk ulasan lama yang belum punya order_item_id.
 */
const REVIEW_SELECT_WITH_PURCHASE = `
  *,
  users ( nama_lengkap ),
  order_items ( product_name, variant_ukuran, variant_warna, quantity )
`;

async function findByProduct(productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select(REVIEW_SELECT_WITH_PURCHASE)
    .eq("product_id", productId)
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
 */
async function findAll({ rating, productId } = {}) {
  let query = supabase
    .from("reviews")
    .select(
      `
      *,
      users ( nama_lengkap ),
      products (
        nama_produk,
        product_images ( image_url, sort_order ),
        product_variants ( sku )
      ),
      order_items ( product_name, variant_ukuran, variant_warna, quantity )
    `
    )
    .order("created_at", { ascending: false });

  if (rating) query = query.eq("rating", rating);
  if (productId) query = query.eq("product_id", productId);

  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
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

async function getAverageRating(productId) {
  const { data, error } = await supabase.from("reviews").select("rating").eq("product_id", productId);
  if (error) throw new AppError(error.message, 500);
  if (!data.length) return { average: 0, count: 0 };
  const sum = data.reduce((acc, r) => acc + r.rating, 0);
  return { average: Number((sum / data.length).toFixed(1)), count: data.length };
}

module.exports = {
  findByProduct,
  findAll,
  findOne,
  findByOrderAndProduct,
  findById,
  create,
  update,
  deleteById,
  getAverageRating,
};
