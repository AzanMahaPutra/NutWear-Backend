const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository user_addresses — mendukung banyak alamat per user (sesuai dokumen).
 */
async function findAllByUser(userId) {
  const { data, error } = await supabase
    .from("user_addresses")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase.from("user_addresses").select("*").eq("id", id).maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create(userId, fields) {
  const { data, error } = await supabase
    .from("user_addresses")
    .insert({
      user_id: userId,
      receiver_name: fields.receiverName,
      phone: fields.phone,
      province: fields.province,
      city: fields.city,
      district: fields.district,
      postal_code: fields.postalCode,
      address: fields.address,
      is_default: fields.isDefault ?? false,
    })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function updateById(id, fields) {
  const { data, error } = await supabase.from("user_addresses").update(fields).eq("id", id).select().maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function deleteById(id) {
  const { error } = await supabase.from("user_addresses").delete().eq("id", id);
  if (error) throw new AppError(error.message, 500);
  return true;
}

/**
 * Mengosongkan is_default semua alamat milik user lain sebelum
 * menjadikan salah satu alamat sebagai default (dipakai setDefault).
 */
async function clearDefaultForUser(userId) {
  const { error } = await supabase.from("user_addresses").update({ is_default: false }).eq("user_id", userId);
  if (error) throw new AppError(error.message, 500);
  return true;
}

module.exports = { findAllByUser, findById, create, updateById, deleteById, clearDefaultForUser };
