const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const { SupabaseRateLimitStore } = require("./rateLimitStore");

/**
 * Rate limiter khusus endpoint Authentication (login/register) — jauh lebih ketat
 * daripada limiter global, untuk mencegah brute force password / spam registrasi.
 * Limiter global di app.js tetap berlaku untuk seluruh endpoint lain.
 *
 * `authLimiter` TETAP dipakai oleh /register, /google, /forgot-password
 * (perilaku tidak berubah). /login sekarang memakai `loginLimiters` di bawah.
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

// ---------------------------------------------------------------------------
// UPDATE #1 — Rate limit /login: batas percobaan per window + cooldown.
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_COOLDOWN_MS = 10 * 60 * 1000;
// Per IP + email: menahan tebak-password ke satu akun. Kuota 10 → user normal yang
// salah password beberapa kali aman, tapi spam/brute force terhenti cepat.
const LOGIN_MAX_PER_ACCOUNT = 10;
// Per IP saja (semua email): menahan "password spraying" ke banyak akun. Lebih longgar
// supaya banyak user di belakang satu IP (kantor/kampus/NAT seluler) tidak saling mengunci.
const LOGIN_MAX_PER_IP = 30;

/** IPv6 dipetakan ke prefix /64 supaya satu pengguna tidak bisa ganti-ganti alamat dalam subnet-nya. */
function normalizeIp(ip) {
  if (!ip) return "unknown";
  const v4mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) return v4mapped[1];
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const full = ip.includes("::")
    ? [...headParts, ...Array(Math.max(0, 8 - headParts.length - tailParts.length)).fill("0"), ...tailParts]
    : headParts;
  return `${full.slice(0, 4).map((g) => g.toLowerCase().padStart(4, "0")).join(":")}::/64`;
}

function emailKeyPart(req) {
  const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 254);
  // Di-hash: tidak menyimpan email mentah di tabel rate_limits, panjang key tetap.
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
}

function createLoginLimiter({ prefix, max, keyGenerator }) {
  return rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    store: new SupabaseRateLimitStore({
      prefix,
      windowMs: LOGIN_WINDOW_MS,
      max,
      cooldownMs: LOGIN_COOLDOWN_MS,
      memoryOnly: env.rateLimitStore !== "supabase",
    }),
    // express-rate-limit sudah mengisi header Retry-After (detik) sebelum handler ini.
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((resetTime ? resetTime.getTime() : Date.now() + LOGIN_COOLDOWN_MS) - Date.now()) / 1000)
      );
      res.status(429).json({
        success: false,
        message: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${Math.ceil(retryAfterSeconds / 60)} menit.`,
        retryAfterSeconds,
      });
    },
  });
}

// Dipasang BERURUTAN di route /login, SEBELUM validator & controller — request yang
// terkena limit ditolak di sini, tidak pernah menyentuh Supabase Auth / database.
const loginLimiters = [
  createLoginLimiter({ prefix: "login-ip", max: LOGIN_MAX_PER_IP, keyGenerator: (req) => normalizeIp(req.ip) }),
  createLoginLimiter({
    prefix: "login-acct",
    max: LOGIN_MAX_PER_ACCOUNT,
    keyGenerator: (req) => `${normalizeIp(req.ip)}:${emailKeyPart(req)}`,
  }),
];

module.exports = { authLimiter, loginLimiters };
