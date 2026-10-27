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

/**
 * Simpan urutan akhir secara atomik lewat fungsi Postgres `reorder_hero_banners` (satu
 * transaksi: validasi id + update sort_order = posisi array). Lihat
 * database/migrations/20261006_add_banner_reorder_functions.sql.
 */
async function reorder(orderedIds) {
  const { error } = await supabase.rpc("reorder_hero_banners", { p_ids: orderedIds });
  if (!error) return true;

  const msg = error.message || "";
  if (msg.includes("REORDER_EMPTY") || msg.includes("REORDER_DUPLICATE")) throw new AppError("Daftar urutan tidak valid", 400);
  // Id yang tidak ada di tabel ini (mis. baru dihapus admin lain, atau bukan milik tabel ini) dan
  // daftar yang tidak lengkap sama-sama berarti "daftar di klien sudah usang" -> 409 supaya UI memuat ulang.
  if (msg.includes("REORDER_UNKNOWN_ID") || msg.includes("REORDER_STALE"))
    throw new AppError("Daftar sudah berubah di server. Muat ulang halaman lalu atur urutan lagi.", 409);
  throw new AppError(error.message, 500);
}

module.exports = { reorder, findAll, findById, create, updateById, deleteById, getNextSortOrder };
