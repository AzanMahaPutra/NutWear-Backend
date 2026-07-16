const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const CART_SELECT = `
  id, quantity, created_at, updated_at,
  product_variants (
    id, ukuran, warna, sku, stok,
    products ( id, nama_produk, slug, harga, harga_promo, harga_promo_color, promo_mulai, promo_selesai,
      product_images ( image_url, sort_order )
    )
  )
`;

async function findAllByUser(userId) {
  const { data, error } = await supabase.from("carts").select(CART_SELECT).eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findOne(userId, variantId) {
  const { data, error } = await supabase
    .from("carts")
    .select("*")
    .eq("user_id", userId)
    .eq("variant_id", variantId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("carts").select("*").eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create(userId, variantId, quantity) {
  const { data, error } = await supabase
    .from("carts")
    .insert({ user_id: userId, variant_id: variantId, quantity })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateQuantity(id, quantity) {
  const { data, error } = await supabase
    .from("carts")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("carts").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

async function deleteAllByUser(userId) {
  const { error } = await supabase.from("carts").delete().eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * UPDATE 2 — Menghapus sekumpulan item keranjang sekaligus berdasarkan id, dibatasi pada
 * milik `userId` (mencegah item user lain ikut terhapus). Dipakai orderService.checkout
 * untuk menghapus HANYA item yang ikut diproses checkout (item yang dicentang), bukan
 * seluruh isi keranjang — item yang tidak dicentang tetap aman di keranjang.
 */
async function deleteByIds(userId, ids) {
  if (!Array.isArray(ids) || ids.length === 0) return true;
  const { error } = await supabase.from("carts").delete().eq("user_id", userId).in("id", ids);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * UPDATE 8 — Menghapus item keranjang berdasarkan variant_id, dibatasi pada milik
 * `userId`. Dipakai setelah pembayaran BERHASIL (bukan lagi segera saat checkout,
 * lihat orderService.checkout & orderService.clearCartForPaidOrder) untuk membuang
 * item keranjang yang variannya sama dengan yang baru saja lunas dibayar.
 */
async function deleteByVariantIds(userId, variantIds) {
  if (!Array.isArray(variantIds) || variantIds.length === 0) return true;
  const { error } = await supabase.from("carts").delete().eq("user_id", userId).in("variant_id", variantIds);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = {
  findAllByUser,
  findOne,
  findById,
  create,
  updateQuantity,
  deleteById,
  deleteAllByUser,
  deleteByIds,
  deleteByVariantIds,
};
