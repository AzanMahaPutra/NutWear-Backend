const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Repository unban_requests — satu-satunya layer yang melakukan query ke tabel
 * `unban_requests` (fitur Banned User & Pengajuan Unban). Service memanggil
 * fungsi-fungsi ini tanpa perlu tahu detail Supabase.
 */

const REQUEST_SELECT_WITH_USER = `
  *,
  users!unban_requests_user_id_fkey ( nama_lengkap, email, status )
`;

/** Cek apakah user masih punya permohonan yang berstatus "menunggu" — dipakai
 * unbanRequestService untuk mencegah pengajuan ganda selagi permohonan sebelumnya
 * belum diproses Admin. */
async function findPendingByUser(userId) {
  const { data, error } = await supabase
    .from("unban_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "menunggu")
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Permohonan unban terbaru milik user (apa pun statusnya) — dipakai frontend
 * Profile untuk menampilkan status pengajuan yang sedang berjalan. */
async function findLatestByUser(userId) {
  const { data, error } = await supabase
    .from("unban_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findAll() {
  const { data, error } = await supabase
    .from("unban_requests")
    .select(REQUEST_SELECT_WITH_USER)
    .order("created_at", { ascending: false });
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function findById(id) {
  const { data, error } = await supabase
    .from("unban_requests")
    .select(REQUEST_SELECT_WITH_USER)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function create({ userId, requestReason, bannedReasonSnapshot }) {
  const { data, error } = await supabase
    .from("unban_requests")
    .insert({
      user_id: userId,
      request_reason: requestReason,
      banned_reason_snapshot: bannedReasonSnapshot ?? null,
    })
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/** Setujui/Tolak permohonan — mencatat siapa Admin yang memproses & kapan. */
async function updateStatus(id, { status, processedBy }) {
  const { data, error } = await supabase
    .from("unban_requests")
    .update({
      status,
      processed_at: new Date().toISOString(),
      processed_by: processedBy,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

module.exports = { findPendingByUser, findLatestByUser, findAll, findById, create, updateStatus };
