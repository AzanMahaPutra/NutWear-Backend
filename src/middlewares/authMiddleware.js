const { verifyAccessToken } = require("../utils/jwt");
const { AppError } = require("../utils/AppError");
const { asyncHandler } = require("../utils/asyncHandler");

/**
 * Middleware reusable untuk melindungi route yang butuh login.
 * Mengambil Bearer token dari header Authorization, verifikasi,
 * lalu menaruh payload user di req.user supaya bisa dipakai controller/service.
 */
const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError("Token akses tidak ditemukan. Silakan login terlebih dahulu.", 401);
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    req.user = payload; // { id, email, role }
    next();
  } catch (err) {
    throw new AppError("Token akses tidak valid atau sudah kedaluwarsa.", 401);
  }
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
