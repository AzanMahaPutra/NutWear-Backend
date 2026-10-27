const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");
const { buildIlikePattern, normalizeSearchTerm, escapeLike, quotePostgrestValue } = require("../utils/postgrestSearch");

/**
 * Repository users — satu-satunya layer yang melakukan query ke tabel `users`.
 * Service memanggil fungsi-fungsi ini tanpa perlu tahu detail Supabase.
 *
 * CATATAN MIGRASI SUPABASE AUTH: sejak migrasi, tabel `users` di sini adalah
 * tabel PROFIL yang melengkapi `auth.users` bawaan Supabase (nama_lengkap,
 * no_hp, role) — bukan lagi tabel yang menyimpan kredensial. Kolom `id` WAJIB
 * sama persis dengan id di `auth.users` (lihat migrations/ untuk skema & FK),
 * dan kolom `password_hash` sudah tidak dipakai/tidak diisi lagi karena
 * password sepenuhnya dikelola Supabase Auth.
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

const CUSTOMER_COLUMNS = "id, nama_lengkap, email, no_hp, role, status, banned_reason, banned_at, created_at";
/**
 * UPDATE 08 — Daftar pelanggan dengan pencarian + pagination di database.
 * `search` dicocokkan (case-insensitive, sebagian kata) ke nama (`nama_lengkap`, yang ditampilkan
 * sebagai "Nama"/username di Manajemen User — tabel `users` tidak punya kolom username terpisah)
 * ATAU `email`. Total (`count`) dihitung dari filter yang sama dengan baris yang dikembalikan,
 * sehingga jumlah halaman selalu konsisten dengan hasil pencarian.
 * Urutan: terbaru dulu, `id` sebagai pemutus seri supaya halaman tidak saling tumpang tindih.
 */
async function findCustomersPage({ search, page = 1, limit = 10 } = {}) {
  const pattern = buildIlikePattern(search);
  const from = (page - 1) * limit;

  let q = supabase.from("users").select(CUSTOMER_COLUMNS, { count: "exact" }).eq("role", "customer");
  if (pattern) {
    q = q.or(`nama_lengkap.ilike.${pattern},email.ilike.${pattern}`);
  }
  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + limit - 1);
  if (error) throw new AppError(error.message, 500);
  return { data: data || [], total: count || 0 };
}

/**
 * UPDATE — Banned User: menandai satu user sebagai banned. `bannedBy` adalah id
 * Admin yang melakukan aksi (req.user.id), disimpan sebagai riwayat siapa yang
 * melakukan banned (lihat CHANGELOG.md).
 */
async function banUser(id, { reason, bannedBy }) {
  const { data, error } = await supabase
    .from("users")
    .update({
      status: "banned",
      banned_reason: reason,
      banned_at: new Date().toISOString(),
      banned_by: bannedBy,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new AppError(error.message, 500);
  return data;
}

/**
 * UPDATE — Pengajuan Unban: dipanggil saat Admin menyetujui permohonan unban.
 * Status akun kembali "aktif" dan seluruh jejak banned dibersihkan dari kolom
 * aktif (riwayat lengkap tetap tersimpan di tabel unban_requests).
 */
async function unbanUser(id) {
  const { data, error } = await supabase
    .from("users")
    .update({
      status: "aktif",
      banned_reason: null,
      banned_at: null,
      banned_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
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

/**
 * Buat baris profil baru. `id` WAJIB diisi dari luar (id user yang sudah
 * dibuat lebih dulu di Supabase Auth lewat `supabase.auth.admin.createUser`
 * — lihat authService.register), bukan digenerate di sini, supaya `users.id`
 * selalu identik dengan `auth.users.id`.
 */
/**
 * `provider`/`avatarUrl` opsional — hanya dipakai saat akun dibuat dari Login
 * Google pertama kali (lihat authService.loginWithGoogle). Register Email &
 * Password biasa tidak mengirim keduanya, sehingga tetap memakai default
 * kolom `provider = 'email'` dan `avatar_url = null` (lihat migration
 * 20260727_add_user_google_oauth_fields.sql) — Register lama tidak berubah.
 */
async function create({ id, namaLengkap, email, noHp, role = "customer", provider, avatarUrl }) {
  const payload = { id, nama_lengkap: namaLengkap, email, no_hp: noHp, role };
  if (provider) payload.provider = provider;
  if (avatarUrl) payload.avatar_url = avatarUrl;

  const { data, error } = await supabase.from("users").insert(payload).select().single();
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

module.exports = {
  findByEmail,
  findById,
  findCustomersPage,
  normalizeSearchTerm,
  escapeLike,
  quotePostgrestValue,
  findAllCustomerIds,
  create,
  updateById,
  banUser,
  unbanUser,
};
