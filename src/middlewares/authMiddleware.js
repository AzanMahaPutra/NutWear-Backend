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
  };
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

module.exports = { requireAuth, requireRole };
