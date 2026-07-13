const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

async function findAll() {
  const { data, error } = await supabase
    .from("categories")
    .select("id, nama_kategori, image_url, image_path, created_at")
    .order("nama_kategori", { ascending: true });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, nama_kategori, image_url, image_path, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create(fields) {
  const { data, error } = await supabase
    .from("categories")
    .insert(fields)
    .select("id, nama_kategori, image_url, image_path, created_at")
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase
    .from("categories")
    .update(fields)
    .eq("id", id)
    .select("id, nama_kategori, image_url, image_path, created_at")
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAll, findById, create, updateById, deleteById };
