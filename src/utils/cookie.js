const env = require("../config/env");

/**
 * Opsi cookie reusable untuk menyimpan refresh token secara httpOnly.
 * Dipakai authController saat login/register/refresh/logout supaya
 * konsisten di semua endpoint yang men-set/menghapus cookie ini.
 */
const REFRESH_TOKEN_COOKIE = "nutwear_refresh_token";

function getRefreshCookieOptions() {
  const isProd = env.nodeEnv === "production";

  return {
    httpOnly: true,
    // Di production (HTTPS Railway) wajib true. Di local (HTTP), tetap false agar bisa terbaca.
    secure: isProd, 
    // Di production wajib "none" agar cookie bisa dikirim lintas-domain antara Vercel dan Railway.
    sameSite: isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari, selaras dengan JWT_REFRESH_EXPIRES_IN default
    path: "/",
  };
}

/**
 * Opsi untuk MENGHAPUS cookie refresh token (dipakai authController.logout).
 * Sengaja dipisah dari getRefreshCookieOptions() (tanpa maxAge, expires di masa lalu)
 * tapi wajib tetap membawa httpOnly/secure/sameSite/path yang SAMA dengan saat cookie
 * itu di-set. Kalau atribut ini tidak sama persis — terutama secure & sameSite di
 * production (Vercel <-> Railway, cross-site, sameSite:"none") — browser bisa gagal
 * mengganti/menghapus cookie lama, sehingga refresh token lama tetap tersimpan di
 * browser walaupun endpoint /auth/logout sudah dipanggil.
 */
function getClearRefreshCookieOptions() {
  const { maxAge, ...rest } = getRefreshCookieOptions();
  return rest;
}

module.exports = { REFRESH_TOKEN_COOKIE, getRefreshCookieOptions, getClearRefreshCookieOptions };