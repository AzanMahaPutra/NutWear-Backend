const rateLimit = require("express-rate-limit");

/**
 * Rate limiter khusus endpoint Authentication (login/register) — jauh lebih ketat
 * daripada limiter global, untuk mencegah brute force password / spam registrasi.
 * Limiter global di app.js tetap berlaku untuk seluruh endpoint lain.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Terlalu banyak percobaan. Silakan coba lagi dalam beberapa menit.",
  },
});

module.exports = { authLimiter };
