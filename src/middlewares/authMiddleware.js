const { supabase } = require("../config/supabase");
const { ensureProfile } = require("../services/authService");
const { AppError } = require("../utils/AppError");
const { asyncHandler } = require("../utils/asyncHandler");

/**
 * Middleware reusable untuk melindungi route yang butuh login.
 *
 * SEJAK MIGRASI KE SUPABASE AUTH: token di header Authorization adalah access
 * token yang diterbitkan Supabase (bukan JWT buatan sendiri lagi), jadi
 * diverifikasi lewat `supabase.auth.getUser(token)` — memanggil GoTrue untuk
 * memastikan token itu memang valid & belum kedaluwarsa/revoked. Setelah
 * valid, baris profil (role, nama_lengkap, no_hp) diambil dari tabel `users`
 * supaya req.user tetap punya bentuk yang sama seperti sebelumnya.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Token akses tidak ditemukan. Silakan login terlebih dahulu.", 401);
  }

  const token = authHeader.split(" ")[1];

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new AppError("Token akses tidak valid atau sudah kedaluwarsa.", 401);
  }

  const profile = await ensureProfile(data.user);
  req.user = {
    id: profile.id,
    email: profile.email,
    namaLengkap: profile.nama_lengkap,
    noHp: profile.no_hp,
    role: profile.role,
    // UPDATE — Banned User: status akun disertakan di req.user supaya
    // blockIfBanned (di bawah) bisa membatasi aktivitas tanpa query ulang.
    status: profile.status ?? "aktif",
    bannedReason: profile.banned_reason ?? null,
  };
  next();
});

/**
 * UPDATE — Review Helpful: middleware reusable untuk route yang TETAP boleh
 * diakses tanpa login (mis. GET /reviews/product/:productId, dilihat semua
 * pengunjung), tapi butuh tahu req.user KALAU user sedang login (supaya bisa
 * menyertakan `myVote` — pilihan vote Membantu/Tidak Membantu milik user yang
 * sedang login pada setiap review). Berbeda dengan requireAuth: token yang
 * tidak ada/tidak valid TIDAK menghasilkan error, req.user hanya dibiarkan
 * undefined dan request tetap lanjut sebagai pengunjung anonim.
 */
const attachUserIfPresent = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return next();
  }

  try {
    const profile = await ensureProfile(data.user);
    req.user = {
      id: profile.id,
      email: profile.email,
      namaLengkap: profile.nama_lengkap,
      noHp: profile.no_hp,
      role: profile.role,
      status: profile.status ?? "aktif",
      bannedReason: profile.banned_reason ?? null,
    };
  } catch {
    // Token valid tapi profil gagal diambil — tetap lanjutkan sebagai anonim
    // daripada menggagalkan request publik ini.
  }
  next();
});

/**
 * Middleware reusable untuk membatasi akses berdasarkan role (mis. hanya admin).
 * Dipakai setelah requireAuth: requireAuth, requireRole("admin")
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw new AppError("Anda tidak memiliki akses ke resource ini.", 403);
    }
    next();
  };
}

/**
 * UPDATE — Banned User: middleware reusable untuk membatasi aktivitas tertentu
 * (Checkout, Beri/Edit Review, Tambah ke Wishlist, Tambah ke Keranjang) bagi
 * user yang sedang berstatus "banned". User yang dibanned TETAP bisa login &
 * memakai route lain (lihat authMiddleware.requireAuth) — middleware ini hanya
 * dipasang di route-route yang memang dibatasi (lihat routes/*.js terkait).
 * Dipasang setelah requireAuth: requireAuth, blockIfBanned
 */
function blockIfBanned(req, res, next) {
  if (req.user?.status === "banned") {
    const reason = req.user.bannedReason ? ` Alasan: ${req.user.bannedReason}.` : "";
    throw new AppError(`Akun Anda sedang dibanned dan tidak dapat melakukan aktivitas ini.${reason}`, 403);
  }
  next();
}

module.exports = { requireAuth, requireRole, blockIfBanned, attachUserIfPresent };
