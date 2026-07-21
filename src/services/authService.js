const { supabase, supabaseAuth } = require("../config/supabase");
const userRepository = require("../repositories/userRepository");
const { AppError } = require("../utils/AppError");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * Business logic Authentication. Dipanggil oleh authController.
 *
 * SEJAK MIGRASI KE SUPABASE AUTH: modul ini tidak lagi menyimpan/verifikasi
 * password sendiri (bcrypt) dan tidak lagi menerbitkan JWT sendiri. Identitas,
 * password, dan session token sepenuhnya dikelola oleh Supabase Auth
 * (`supabase.auth.*`). Modul ini hanya:
 *   1) Memanggil API resmi Supabase Auth untuk register/login/refresh/forgot
 *      password, dan
 *   2) Menjaga tabel `users` tetap sinkron sebagai data PROFIL tambahan
 *      (nama_lengkap, no_hp, role) yang tidak disediakan Supabase Auth secara
 *      bawaan.
 */

function toSafeUser(profile) {
  return {
    id: profile.id,
    namaLengkap: profile.nama_lengkap,
    email: profile.email,
    noHp: profile.no_hp,
    role: profile.role,
    // UPDATE — Banned User: dikirim supaya frontend tahu status akun begitu
    // login berhasil (user yang dibanned tetap boleh login, lihat authMiddleware).
    status: profile.status ?? "aktif",
    bannedReason: profile.banned_reason ?? null,
  };
}

/**
 * Ambil baris profil user; kalau belum ada (mis. akun dibuat langsung dari
 * Supabase Dashboard, bukan lewat endpoint /auth/register kita), buat baris
 * default seadanya supaya app tidak error. Dipakai oleh login() & authMiddleware
 * supaya perilakunya konsisten di kedua tempat.
 */
async function ensureProfile(authUser) {
  const existing = await userRepository.findById(authUser.id);
  if (existing) return existing;

  logger.info("[authService] Membuat baris profil default untuk user Supabase Auth yang belum punya profil", {
    userId: authUser.id,
  });
  return userRepository.create({
    id: authUser.id,
    namaLengkap: authUser.user_metadata?.nama_lengkap || authUser.email,
    email: authUser.email,
    noHp: authUser.user_metadata?.no_hp || null,
    role: "customer",
  });
}

/**
 * Register — memakai Supabase Auth Admin API (`auth.admin.createUser`) supaya
 * password langsung disimpan & di-hash oleh Supabase, bukan oleh kode kita.
 * `email_confirm: true` supaya user tidak perlu konfirmasi email dulu sebelum
 * bisa login (mengikuti perilaku lama: bisa langsung Login setelah Register).
 * Kalau proyek ingin mewajibkan verifikasi email, ubah ini jadi `false` dan
 * aktifkan "Confirm email" di Supabase Dashboard → Authentication → Providers.
 *
 * TIDAK mengembalikan token/session (sama seperti perilaku lama secara efektif
 * — lihat authService.ts frontend: token hasil Register sengaja tidak pernah
 * dipakai, user selalu diarahkan ke halaman Login setelah daftar akun).
 */
async function register({ namaLengkap, email, password, noHp }) {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nama_lengkap: namaLengkap, no_hp: noHp },
  });

  if (error) {
    // Supabase Auth mengembalikan pesan/kode spesifik untuk email yang sudah
    // terdaftar — dipetakan ke pesan Indonesia yang sama seperti sebelumnya.
    if (error.status === 422 || /already been registered|already exists/i.test(error.message || "")) {
      throw new AppError("Email sudah terdaftar", 409);
    }
    logger.error("[authService] Supabase Auth admin.createUser gagal", { error: error.message });
    throw new AppError("Gagal mendaftarkan akun, silakan coba lagi", 500);
  }

  const profile = await userRepository.create({
    id: data.user.id,
    namaLengkap,
    email,
    noHp,
    role: "customer",
  });

  return { user: toSafeUser(profile) };
}

/**
 * Login — memakai `supabaseAuth.auth.signInWithPassword`, mekanisme resmi
 * Supabase Auth. Access token & refresh token yang dikembalikan berasal
 * langsung dari Supabase (bukan JWT buatan sendiri lagi).
 */
async function login({ email, password }) {
  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });

  if (error) {
    throw new AppError("Email atau password salah", 401);
  }

  const profile = await ensureProfile(data.user);

  return {
    user: toSafeUser(profile),
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/**
 * Refresh — menukar refresh token (disimpan di httpOnly cookie, lihat
 * authController & utils/cookie.js) dengan access token baru lewat
 * `supabaseAuth.auth.refreshSession`. Supabase juga merotasi refresh token
 * setiap kali dipakai (default project setting "Refresh token rotation") —
 * refresh token baru dari Supabase itu yang kita simpan lagi ke cookie.
 */
async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError("Refresh token tidak ditemukan", 401);
  }

  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });

  if (error || !data.session) {
    throw new AppError("Refresh token tidak valid atau sudah kedaluwarsa", 401);
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

/**
 * Langkah 1 Forgot Password — memakai `supabaseAuth.auth.resetPasswordForEmail`,
 * mekanisme RESMI bawaan Supabase Auth (bukan token/tabel buatan sendiri lagi).
 * Supabase sendiri yang mengirim email lewat Email Provider yang dikonfigurasi
 * di Supabase Dashboard (bawaan Supabase, atau SMTP custom kalau diaktifkan —
 * lihat CHANGELOG.md), dan Supabase SENDIRI sudah tidak membedakan respons
 * antara email terdaftar/tidak terdaftar (tidak melempar error untuk kasus
 * "email tidak ditemukan"), jadi tidak ada risiko enumerasi akun dari sisi ini.
 * authController tetap membalas dengan pesan generik yang sama seperti
 * sebelumnya, sebagai lapisan konsistensi UI.
 */
async function requestPasswordReset(email) {
  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
    redirectTo: `${env.frontendUrl}/reset-password`,
  });

  // Kegagalan di titik ini SELALU berarti masalah konfigurasi/infrastruktur
  // (mis. SUPABASE_ANON_KEY salah, Site URL/Redirect URL belum diisi di
  // Supabase Dashboard, rate limit email Supabase tercapai) — BUKAN "email
  // tidak terdaftar" (Supabase tidak melempar error untuk kasus itu). Karena
  // itu tetap aman dicatat sebagai log saja, tidak dilempar ke controller,
  // supaya respons ke user tetap pesan generik yang sama.
  if (error) {
    logger.error("[authService] supabase.auth.resetPasswordForEmail gagal — cek konfigurasi Supabase Auth", {
      error: error.message,
      status: error.status,
    });
  } else {
    logger.info("[authService] Permintaan reset password diteruskan ke Supabase Auth", { email });
  }
}

module.exports = { register, login, refresh, toSafeUser, ensureProfile, requestPasswordReset };
