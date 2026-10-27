const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const env = require("../config/env");
const { SupabaseRateLimitStore } = require("./rateLimitStore");
const { LOGIN_BLOCK_COOKIE, getLoginBlockCookieOptions } = require("../utils/cookie");

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
// UPDATE 11 — Cooldown 10 menit → 5 menit (300 detik); status blokir bisa ditanyakan ulang.
// ---------------------------------------------------------------------------
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
// Lama blokir SETELAH batas percobaan tercapai. 300 detik = 5 menit. Dikirim ke fungsi SQL
// `rate_limit_hit` sebagai p_cooldown_ms, jadi tidak ada angka kedua yang perlu disamakan di DB.
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000;
// Per IP + email: menahan tebak-password ke satu akun. Kuota 10 → user normal yang
// salah password beberapa kali aman, tapi spam/brute force terhenti cepat.
const LOGIN_MAX_PER_ACCOUNT = 10;
// Per IP saja (semua email): menahan "password spraying" ke banyak akun. Lebih longgar
// supaya banyak user di belakang satu IP (kantor/kampus/NAT seluler) tidak saling mengunci.
// Batas ini juga yang menjaga agar mengganti-ganti string email (identitas yang bebas
// dikirim client) tidak bisa menghindari pembatasan.
const LOGIN_MAX_PER_IP = 30;

const LOGIN_RATE_LIMIT_CONFIG = Object.freeze({
  windowMs: LOGIN_WINDOW_MS,
  cooldownMs: LOGIN_COOLDOWN_MS,
  maxPerAccount: LOGIN_MAX_PER_ACCOUNT,
  maxPerIp: LOGIN_MAX_PER_IP,
});

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

/** Di-hash: tidak menyimpan email mentah di tabel rate_limits, panjang key tetap. */
function hashEmail(rawEmail) {
  const email = String(rawEmail ?? "").trim().toLowerCase().slice(0, 254);
  return crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
}

function emailKeyPart(req) {
  return hashEmail(req.body?.email);
}

/** Pesan wajar untuk klien non-UI: "5 menit" / "45 detik". Countdown akurat memakai retryAfterSeconds. */
function describeWait(seconds) {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} menit` : `${seconds} detik`;
}

const ipKey = (req) => normalizeIp(req.ip);
const accountKey = (req) => `${normalizeIp(req.ip)}:${emailKeyPart(req)}`;

function createLoginStore(prefix, max) {
  return new SupabaseRateLimitStore({
    prefix,
    windowMs: LOGIN_WINDOW_MS,
    max,
    cooldownMs: LOGIN_COOLDOWN_MS,
    memoryOnly: env.rateLimitStore !== "supabase",
  });
}

const loginIpStore = createLoginStore("login-ip", LOGIN_MAX_PER_IP);
const loginAccountStore = createLoginStore("login-acct", LOGIN_MAX_PER_ACCOUNT);

function createLoginLimiter({ store, max, keyGenerator, setBlockHint = false }) {
  return rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    limit: max,
    // Header RateLimit-* sengaja dimatikan: tidak membocorkan batas/sisa kuota ke penyerang.
    // Satu-satunya informasi waktu yang dikirim adalah Retry-After (detik) pada respons 429,
    // diisi di handler dari sisa waktu yang dihitung database.
    standardHeaders: false,
    legacyHeaders: false,
    keyGenerator,
    store,
    // Dipanggil hanya bila totalHits > limit, yaitu request ditolak karena blokir aktif
    // (atau karena percobaan ini yang memicu blokir). Jika store gagal, express-rate-limit
    // meneruskan error ke errorHandler (503) — handler ini TIDAK dijalankan dan request
    // TIDAK dilanjutkan ke login.
    handler: (req, res) => {
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(((resetTime ? resetTime.getTime() : Date.now() + LOGIN_COOLDOWN_MS) - Date.now()) / 1000)
      );
      res.set("Retry-After", String(retryAfterSeconds));
      res.set("Cache-Control", "no-store");
      // Petunjuk akun (hanya hash email) supaya status blokir bisa ditemukan lagi setelah
      // refresh / tab baru walau kolom email masih kosong. Lihat utils/cookie.js.
      if (setBlockHint) {
        res.cookie(LOGIN_BLOCK_COOKIE, emailKeyPart(req), getLoginBlockCookieOptions(retryAfterSeconds * 1000));
      }
      // Pesan & bentuk respons SAMA untuk email terdaftar maupun tidak, dan tidak
      // menyebut limiter mana (IP/akun) yang memblokir.
      res.status(429).json({
        success: false,
        code: "LOGIN_RATE_LIMITED",
        message: `Terlalu banyak percobaan login. Silakan coba lagi dalam ${describeWait(retryAfterSeconds)}.`,
        retryAfterSeconds,
      });
    },
  });
}

// Dipasang BERURUTAN di route /login, SEBELUM validator & controller — request yang
// terkena limit ditolak di sini, tidak pernah menyentuh Supabase Auth / database profil.
const loginLimiters = [
  createLoginLimiter({ store: loginIpStore, max: LOGIN_MAX_PER_IP, keyGenerator: ipKey }),
  createLoginLimiter({ store: loginAccountStore, max: LOGIN_MAX_PER_ACCOUNT, keyGenerator: accountKey, setBlockHint: true }),
];

/**
 * Status blokir login untuk pemanggil ini — READ-ONLY (tidak menambah hit, tidak
 * memperpanjang blokir, tidak bisa dipakai untuk membuka blokir).
 *
 * Yang dicek: key IP pemanggil, ditambah key akun (IP + hash email) bila email diketahui —
 * dari body (user sudah mengetik email) atau, bila kosong, dari cookie petunjuk. Karena key
 * akun SELALU memuat IP pemanggil, seseorang hanya bisa melihat status blokir miliknya
 * sendiri; status juga tidak bergantung pada apakah email itu terdaftar.
 *
 * Hasil digabung (sisa waktu terpanjang) sehingga tidak terlihat limiter mana yang aktif.
 * Bila penyimpanan gagal, store melempar AppError 503 (fail-closed untuk login; frontend
 * memperlakukan status "tidak diketahui" dan backend tetap memutuskan saat login).
 *
 * @returns {Promise<{ blocked: boolean, retryAfterSeconds: number }>}
 */
async function getLoginBlockStatus(req) {
  const ip = ipKey(req);
  const typedEmail = String(req.body?.email ?? "").trim();
  const cookieHash = req.cookies?.[LOGIN_BLOCK_COOKIE];
  const emailHash = typedEmail
    ? hashEmail(typedEmail)
    : typeof cookieHash === "string" && /^[a-f0-9]{32}$/.test(cookieHash)
      ? cookieHash
      : null;

  const checks = [loginIpStore.status(ip)];
  if (emailHash) checks.push(loginAccountStore.status(`${ip}:${emailHash}`));
  const results = await Promise.all(checks);

  const retryAfterMs = Math.max(0, ...results.map((r) => (r.blocked ? r.retryAfterMs : 0)));
  return { blocked: retryAfterMs > 0, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
}

/**
 * Pembatas ringan untuk endpoint status (hanya pembacaan) supaya tidak bisa dipakai
 * membanjiri database. Best-effort per-instance (memori) — BUKAN proteksi login.
 * Dilewati saat NODE_ENV=test, sama seperti limiter global di app.js.
 */
const loginStatusLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: false,
  legacyHeaders: false,
  skip: () => env.nodeEnv === "test",
  message: { success: false, message: "Terlalu banyak permintaan. Silakan coba lagi sebentar lagi." },
});

module.exports = {
  authLimiter,
  loginLimiters,
  loginStatusLimiter,
  getLoginBlockStatus,
  LOGIN_RATE_LIMIT_CONFIG,
};
