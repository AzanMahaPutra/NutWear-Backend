const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

const CATEGORY_SELECT = "id, nama_kategori, image_url, image_path, sort_order, created_at";

async function findAll() {
  // UPDATE — Urutan Kategori: kategori diurutkan berdasarkan sort_order (diatur
  // Admin lewat drag & drop), bukan lagi alfabetis. Lihat migrations/20260727_add_category_sort_order.sql.
  const { data, error } = await supabase.from("categories").select(CATEGORY_SELECT).order("sort_order", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("categories").select(CATEGORY_SELECT).eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function getNextSortOrder() {
  const { data, error } = await supabase
    .from("categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data ? data.sort_order + 1 : 0;
}

async function create(fields) {
  const { data, error } = await supabase.from("categories").insert(fields).select(CATEGORY_SELECT).single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase.from("categories").update(fields).eq("id", id).select(CATEGORY_SELECT).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAll, findById, create, updateById, deleteById, getNextSortOrder };
