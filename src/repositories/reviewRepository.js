const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

async function findByProduct(productId) {
  const { data, error } = await supabase
    .from("reviews")
    .select("*, users ( nama_lengkap )")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * Dipakai halaman Review Admin — menyertakan thumbnail & SKU produk supaya
 * admin tahu persis produk mana yang direview, tanpa perlu buka halaman lain.
 * `rating` opsional untuk filter jumlah bintang (1-5).
 */
async function findAll({ rating } = {}) {
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
      )
    `
    )
    .order("created_at", { ascending: false });

  if (rating) query = query.eq("rating", rating);

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

async function create({ userId, productId, rating, comment }) {
  const { data, error } = await supabase
    .from("reviews")
    .insert({ user_id: userId, product_id: productId, rating, comment })
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

module.exports = { findByProduct, findAll, findOne, create, deleteById, getAverageRating };
