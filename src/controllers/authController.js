const authService = require("../services/authService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const { REFRESH_TOKEN_COOKIE, getRefreshCookieOptions, getClearRefreshCookieOptions } = require("../utils/cookie");

/**
 * Controller Auth — hanya menangani request/response HTTP,
 * seluruh business logic didelegasikan ke authService.
 */

const register = asyncHandler(async (req, res) => {
  const { namaLengkap, email, password, noHp } = req.body;
  // authService.register() TIDAK mengembalikan session/token — Supabase Auth
  // Admin API (admin.createUser) memang tidak membuat session, sejalan dengan
  // alur produk saat ini yang mengharuskan user Login ulang secara eksplisit
  // setelah Register (lihat RegisterForm frontend: redirect ke /login).
  const { user } = await authService.register({ namaLengkap, email, password, noHp });

  return successResponse(res, {
    statusCode: 201,
    message: "Registrasi berhasil",
    data: { user },
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login({ email, password });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshCookieOptions());
  return successResponse(res, {
    message: "Login berhasil",
    data: { user, accessToken },
  });
});

const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
  const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken);

  res.cookie(REFRESH_TOKEN_COOKIE, newRefreshToken, getRefreshCookieOptions());
  return successResponse(res, {
    message: "Token berhasil diperbarui",
    data: { accessToken },
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(REFRESH_TOKEN_COOKIE, getClearRefreshCookieOptions());
  return successResponse(res, { message: "Logout berhasil" });
});

const me = asyncHandler(async (req, res) => {
  // req.user diisi oleh requireAuth middleware
  return successResponse(res, { message: "OK", data: { user: req.user } });
});

// Pesan generik yang SELALU dikembalikan apa pun hasilnya (email ditemukan atau
// tidak, pengiriman email berhasil atau gagal) — mencegah enumerasi akun.
// Supabase Auth sendiri sudah tidak membedakan responsnya untuk kedua kasus itu
// (lihat authService.requestPasswordReset), pesan generik ini murni konsistensi UI.
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "Jika email yang Anda masukkan terdaftar pada sistem, kami akan mengirimkan tautan untuk mengatur ulang password.";

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
  return successResponse(res, { message: FORGOT_PASSWORD_GENERIC_MESSAGE });
});

// CATATAN MIGRASI SUPABASE AUTH: endpoint `resetPassword` (Langkah 2 Forgot
// Password) SENGAJA DIHAPUS dari backend. Link email Supabase Auth membawa
// recovery session yang HANYA bisa dibaca oleh browser (lewat URL), sehingga
// penggantian password wajib dipanggil langsung dari frontend memakai
// `supabase.auth.updateUser({ password })` — lihat
// frontend/features/auth/components/ResetPasswordForm.tsx dan
// frontend/services/authService.ts. Ini juga persis skema resmi yang
// direkomendasikan dokumentasi Supabase Auth untuk alur Reset Password.

module.exports = { register, login, refresh, logout, me, forgotPassword };
