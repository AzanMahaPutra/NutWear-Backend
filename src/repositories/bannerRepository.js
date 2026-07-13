const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

// Sertakan relasi produk tujuan (kalau ada) sekaligus SKU varian pertamanya,
// supaya frontend tidak perlu request tambahan untuk menampilkan link Hero Banner.
const BANNER_SELECT = `*, product:products ( id, nama_produk, slug, product_variants ( sku ) )`;

async function findAll({ activeOnly } = {}) {
  let query = supabase.from("banners").select(BANNER_SELECT).order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("banners").select(BANNER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function getNextSortOrder() {
  const { data, error } = await supabase
    .from("banners")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? data.sort_order + 1 : 0;
}

async function create(fields) {
  const { data, error } = await supabase.from("banners").insert(fields).select(BANNER_SELECT).single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase.from("banners").update(fields).eq("id", id).select(BANNER_SELECT).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAll, findById, create, updateById, deleteById, getNextSortOrder };
