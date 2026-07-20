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
  // Nilai pertama juga dipakai sebagai `redirectTo` link email Forgot Password
  // Supabase Auth (lihat authService.requestPasswordReset) — WAJIB sudah terdaftar
  // di Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000",
  frontendUrls: (process.env.FRONTEND_URL || "http://localhost:3000")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),

  // Vercel membuat URL BARU setiap kali ada preview deployment (per branch,
  // per commit, dst) dengan pola:
  //   https://<nama-project>-<hash-atau-info-branch>-<nama-tim/akun>.vercel.app
  // URL ini SELALU beda dari domain production dan TIDAK MUNGKIN didaftarkan
  // manual satu-satu di FRONTEND_URL setiap kali deploy. Makanya, selain
  // exact-match dari frontendUrls di atas, kita juga percayai origin apa pun
  // yang jelas-jelas milik project Vercel yang sama ini — dicocokkan lewat
  // VERCEL_PROJECT_NAME (nama project di Vercel, contoh: "nut-wear-frontend").
  // Regex ini match:
  //   - https://nut-wear-frontend.vercel.app                     (production)
  //   - https://nut-wear-frontend-git-main-peanuts67.vercel.app  (branch preview)
  //   - https://nut-wear-frontend-<hash>-peanuts67.vercel.app    (commit preview)
  // dan TIDAK match domain vercel.app project lain, jadi tetap aman.
  vercelPreviewOriginRegex: process.env.VERCEL_PROJECT_NAME
    ? new RegExp(`^https:\\/\\/${process.env.VERCEL_PROJECT_NAME}(-[a-z0-9-]+)?\\.vercel\\.app$`)
    : null,

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

  // CATATAN MIGRASI SUPABASE AUTH: konfigurasi `jwt.*` (JWT_ACCESS_SECRET, dst),
  // `smtp.*` (SMTP_HOST, dst), dan `passwordReset.*` sudah TIDAK dipakai lagi sejak
  // migrasi ke Supabase Auth bawaan — session token dan pengiriman email reset
  // password sekarang sepenuhnya ditangani oleh Supabase (lihat CHANGELOG.md).
  // Env var lama boleh dihapus dari .env, sudah tidak dibaca di mana pun.

  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
  },
};
