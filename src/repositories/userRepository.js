const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository users — satu-satunya layer yang melakukan query ke tabel `users`.
 * Service memanggil fungsi-fungsi ini tanpa perlu tahu detail Supabase.
 */
async function findByEmail(email) {
  const { data, error } = await supabase.from("users").select("*").eq("email", email).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findAllCustomers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, nama_lengkap, email, no_hp, role, created_at")
    .eq("role", "customer")
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Hanya mengambil id (bukan seluruh kolom) — dipakai untuk broadcast Notifikasi
 * New Arrival/Promo ke seluruh customer supaya query tetap ringan (Update 1). */
async function findAllCustomerIds() {
  const { data, error } = await supabase.from("users").select("id").eq("role", "customer");
  if (error) throw new AppError(error.message, 500);
  return (data || []).map((row) => row.id);
}

async function create({ namaLengkap, email, passwordHash, noHp }) {
  const { data, error } = await supabase
    .from("users")
    .insert({ nama_lengkap: namaLengkap, email, password_hash: passwordHash, no_hp: noHp, role: "customer" })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase
    .from("users")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

module.exports = { findByEmail, findById, findAllCustomers, findAllCustomerIds, create, updateById };
