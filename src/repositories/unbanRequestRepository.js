const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");
const { buildIlikePattern } = require("../utils/postgrestSearch");

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

const REQUEST_SELECT_WITH_USER_INNER = `
  *,
  users!unban_requests_user_id_fkey!inner ( nama_lengkap, email, status )
`;

/**
 * UPDATE 09 — Daftar permohonan dengan search + filter status + pagination di database.
 * `search` dicocokkan (case-insensitive, sebagian kata) ke nama pemohon (`users.nama_lengkap`, yang
 * tampil sebagai "Nama User"; tidak ada kolom username terpisah) ATAU `users.email`. Saat ada
 * search, relasi `users` di-join `!inner` supaya baris permohonan yang penggunanya tidak cocok
 * ikut tersaring DAN ikut dihitung di `count`, sehingga jumlah halaman konsisten dengan hasil.
 * Urutan: terbaru dulu + `id` pemutus seri.
 */
async function findPage({ search, status, page = 1, limit = 10 } = {}) {
  const pattern = buildIlikePattern(search);
  const from = (page - 1) * limit;

  let q = supabase
    .from("unban_requests")
    .select(pattern ? REQUEST_SELECT_WITH_USER_INNER : REQUEST_SELECT_WITH_USER, { count: "exact" });
  if (status) q = q.eq("status", status);
  if (pattern) {
    q = q.or(`nama_lengkap.ilike.${pattern},email.ilike.${pattern}`, { referencedTable: "users" });
  }
  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new AppError(error.message, 500);
  return { data: data || [], total: count || 0 };
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

/**
 * UPDATE 09 — Hapus SATU permohonan yang sudah diproses (disetujui/ditolak). Hard delete: sistem ini
 * tidak memakai soft delete di tabel mana pun (tidak ada kolom deleted_at), dan baris ini hanya riwayat.
 * Kondisi status ada di query DELETE itu sendiri (bukan hanya cek di service) supaya tidak pernah
 * menghapus permohonan "menunggu" walau status berubah di antara pengecekan dan penghapusan.
 * Hanya tabel `unban_requests` yang disentuh — akun pengguna dan data transaksi tidak terpengaruh.
 * Mengembalikan baris yang dihapus, atau null bila tidak ada yang cocok.
 */
async function deleteProcessedById(id) {
  const { data, error } = await supabase
    .from("unban_requests")
    .delete()
    .eq("id", id)
    .in("status", ["disetujui", "ditolak"])
    .select("id");
  if (error) throw new AppError(error.message, 500);
  return data?.[0] ?? null;
}

module.exports = { findPendingByUser, findLatestByUser, findPage, findById, create, updateStatus, deleteProcessedById };
