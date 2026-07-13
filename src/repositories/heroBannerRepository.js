const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

// Sertakan relasi produk & kategori tujuan (kalau ada) sekaligus SKU varian
// pertama produk, supaya frontend tidak perlu request tambahan untuk
// menampilkan link Hero Banner.
const HERO_BANNER_SELECT = `*, product:products ( id, nama_produk, slug, product_variants ( sku ) ), category:categories ( id, nama_kategori )`;

async function findAll({ activeOnly } = {}) {
  let query = supabase.from("hero_banners").select(HERO_BANNER_SELECT).order("sort_order", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("hero_banners").select(HERO_BANNER_SELECT).eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function getNextSortOrder() {
  const { data, error } = await supabase
    .from("hero_banners")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? data.sort_order + 1 : 0;
}

async function create(fields) {
  const { data, error } = await supabase.from("hero_banners").insert(fields).select(HERO_BANNER_SELECT).single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase
    .from("hero_banners")
    .update(fields)
    .eq("id", id)
    .select(HERO_BANNER_SELECT)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("hero_banners").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAll, findById, create, updateById, deleteById, getNextSortOrder };
