const env = require("../config/env");

/**
 * Opsi cookie reusable untuk menyimpan refresh token secara httpOnly.
 * Dipakai authController saat login/register/refresh/logout supaya
 * konsisten di semua endpoint yang men-set/menghapus cookie ini.
 */
const REFRESH_TOKEN_COOKIE = "nutwear_refresh_token";

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari, selaras dengan JWT_REFRESH_EXPIRES_IN default
    path: "/",
  };
}

module.exports = { REFRESH_TOKEN_COOKIE, getRefreshCookieOptions };
