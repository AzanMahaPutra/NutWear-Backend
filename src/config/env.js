/**
 * Konstanta konfigurasi aplikasi yang dibaca dari environment variables.
 * Reusable di seluruh modul (auth service, middleware, dll) supaya
 * tidak ada `process.env.X` tersebar di banyak file.
 */
module.exports = {
  port: process.env.PORT || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  // FRONTEND_URL boleh berisi beberapa origin dipisah koma (mis. saat frontend juga
  // sempat diakses lewat URL lain selama development) — dipakai oleh CORS di app.js.
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  frontendUrls: (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),

  // URL publik tempat backend ini bisa diakses dari luar (mis. domain Cloudflare Tunnel
  // saat development, atau domain production sebenarnya). Dipakai untuk menampilkan URL
  // Webhook Midtrans yang benar di log saat server start — lihat CHANGELOG.md.
  backendPublicUrl: (process.env.BACKEND_PUBLIC_URL || `http://localhost:${process.env.PORT || 4000}`).replace(
    /\/$/,
    ""
  ),

  // "1"/"true" jika backend berjalan di belakang reverse proxy/tunnel (Cloudflare Tunnel,
  // ngrok, dst) supaya Express menghormati header X-Forwarded-* (IP asli untuk rate
  // limiter, req.protocol/secure, dll). Tanpa ini, express-rate-limit akan melempar error
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR begitu request lewat Cloudflare Tunnel membawa
  // header X-Forwarded-For.
  trustProxy: ["1", "true"].includes((process.env.TRUST_PROXY || "0").toLowerCase()),

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },

  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },

  // SMTP untuk pengiriman email (saat ini hanya dipakai fitur Forgot Password —
  // lihat utils/mailer.js). Lihat CHANGELOG.md untuk contoh pengisian .env
  // lengkap (mis. App Password Gmail).
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    // "true"/"1" untuk port 465 (SSL langsung). Default false (STARTTLS, port 587).
    secure: ["true", "1"].includes((process.env.SMTP_SECURE || "false").toLowerCase()),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },

  passwordReset: {
    // Masa berlaku token reset password, dalam menit.
    tokenExpiresMinutes: Number(process.env.PASSWORD_RESET_TOKEN_EXPIRES_MINUTES) || 30,
  },
};
