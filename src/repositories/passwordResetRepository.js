const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository password_reset_tokens — satu-satunya layer yang melakukan query
 * ke tabel `password_reset_tokens`. Dipakai oleh authService untuk fitur
 * Forgot Password.
 */

async function create({ userId, tokenHash, expiresAt }) {
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .insert({ user_id: userId, token_hash: tokenHash, expires_at: expiresAt })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findByTokenHash(tokenHash) {
  const { data, error } = await supabase
    .from("password_reset_tokens")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function markUsed(id) {
  const { error } = await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new AppError(error.message, 500);
}

/**
 * Menghapus seluruh token reset milik satu user yang BELUM dipakai.
 * Dipanggil setiap kali ada permintaan reset password baru (supaya link lama
 * yang belum dipakai otomatis tidak berlaku lagi — hanya satu link aktif
 * pada satu waktu) dan setelah reset password berhasil (membersihkan sisa
 * token lain yang mungkin masih ada untuk user tersebut).
 */
async function deleteUnusedForUser(userId) {
  const { error } = await supabase.from("password_reset_tokens").delete().eq("user_id", userId).is("used_at", null);
  if (error) throw new AppError(error.message, 500);
}

module.exports = { create, findByTokenHash, markUsed, deleteUnusedForUser };
