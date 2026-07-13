const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const WISHLIST_SELECT = `
  id, created_at,
  products ( id, nama_produk, slug, harga, harga_promo, harga_promo_color, promo_mulai, promo_selesai,
    product_images ( image_url, sort_order )
  )
`;

async function findAllByUser(userId) {
  const { data, error } = await supabase.from("wishlists").select(WISHLIST_SELECT).eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findOne(userId, productId) {
  const { data, error } = await supabase
    .from("wishlists")
    .select("*")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create(userId, productId) {
  const { data, error } = await supabase
    .from("wishlists")
    .insert({ user_id: userId, product_id: productId })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteByProduct(userId, productId) {
  const { error } = await supabase.from("wishlists").delete().eq("user_id", userId).eq("product_id", productId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAllByUser, findOne, create, deleteByProduct };
