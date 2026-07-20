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
  const { user, accessToken, refreshToken } = await authService.register({ namaLengkap, email, password, noHp });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getRefreshCookieOptions());
  return successResponse(res, {
    statusCode: 201,
    message: "Registrasi berhasil",
    data: { user, accessToken },
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
// Lihat authService.requestPasswordReset untuk detail kenapa ini aman dilakukan
// di sini (bukan di service).
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  "Jika email yang Anda masukkan terdaftar pada sistem, kami akan mengirimkan tautan untuk mengatur ulang password.";

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  await authService.requestPasswordReset(email);
  return successResponse(res, { message: FORGOT_PASSWORD_GENERIC_MESSAGE });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  await authService.resetPassword({ token, password });
  return successResponse(res, { message: "Password berhasil diperbarui, silakan login dengan password baru Anda" });
});

module.exports = { register, login, refresh, logout, me, forgotPassword, resetPassword };
