const crypto = require("crypto");
const userRepository = require("../repositories/userRepository");
const passwordResetRepository = require("../repositories/passwordResetRepository");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { AppError } = require("../utils/AppError");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * Business logic Authentication. Dipanggil oleh authController.
 * Tidak tahu apa pun soal req/res (murni logic) supaya reusable & mudah ditest.
 */

function toSafeUser(user) {
  return {
    id: user.id,
    namaLengkap: user.nama_lengkap,
    email: user.email,
    noHp: user.no_hp,
    role: user.role,
  };
}

function buildTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
}

async function register({ namaLengkap, email, password, noHp }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError("Email sudah terdaftar", 409);
  }

  const passwordHash = await hashPassword(password);
  const user = await userRepository.create({ namaLengkap, email, passwordHash, noHp });

  const tokens = buildTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new AppError("Email atau password salah", 401);
  }

  const isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch) {
    throw new AppError("Email atau password salah", 401);
  }

  const tokens = buildTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    throw new AppError("Refresh token tidak ditemukan", 401);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (err) {
    throw new AppError("Refresh token tidak valid atau sudah kedaluwarsa", 401);
  }

  const user = await userRepository.findById(payload.id);
  if (!user) {
    throw new AppError("Pengguna tidak ditemukan", 404);
  }

  return buildTokens(user);
}

/** SHA-256 hex hash — dipakai untuk menyimpan token reset password di database
 * (token asli hanya pernah muncul di URL email, tidak pernah ditulis ke DB). */
function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Langkah 1 Forgot Password: user memasukkan email.
 *
 * PENTING soal keamanan (pencegahan enumerasi akun): fungsi ini SENGAJA tidak
 * pernah melempar error/berbeda perilaku ketika email tidak ditemukan atau
 * ketika pengiriman email gagal karena masalah SMTP — authController selalu
 * mengembalikan pesan sukses generik yang sama ke user apa pun hasilnya.
 * Kegagalan (email tidak ditemukan, SMTP down, dst) hanya dicatat di log
 * backend (lihat utils/logger.js) supaya admin bisa mendiagnosis, tapi tidak
 * pernah bocor ke response API.
 */
async function requestPasswordReset(email) {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    logger.info("[authService] Permintaan reset password untuk email yang tidak terdaftar", { email });
    return;
  }

  // Token lama yang belum dipakai langsung tidak berlaku begitu ada
  // permintaan baru — hanya link reset TERBARU yang aktif untuk user ini.
  await passwordResetRepository.deleteUnusedForUser(user.id);

  const token = crypto.randomBytes(32).toString("hex"); // token asli, dikirim lewat email
  const tokenHash = hashResetToken(token); // hanya hash ini yang disimpan di DB
  const expiresAt = new Date(Date.now() + env.passwordReset.tokenExpiresMinutes * 60 * 1000);

  await passwordResetRepository.create({ userId: user.id, tokenHash, expiresAt: expiresAt.toISOString() });

  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      expiresMinutes: env.passwordReset.tokenExpiresMinutes,
    });
  } catch (err) {
    // Gagal kirim email TIDAK dilempar ke controller — lihat catatan keamanan
    // di atas. Penyebab lengkap (auth SMTP gagal, koneksi ditolak, dst) sudah
    // dicatat oleh mailer.js sebelum error ini sampai ke sini.
    logger.error("[authService] Pengiriman email reset password gagal, lihat log [mailer] di atas", {
      userId: user.id,
    });
  }
}

/**
 * Langkah 2 Forgot Password: user membuka link dari email dan mengirim
 * password baru. Berbeda dari requestPasswordReset, di sini error BOLEH
 * (dan harus) dilempar apa adanya — pada titik ini user sudah memegang token
 * dari email, jadi tidak ada risiko enumerasi akun.
 */
async function resetPassword({ token, password }) {
  const tokenHash = hashResetToken(token);
  const resetToken = await passwordResetRepository.findByTokenHash(tokenHash);

  if (!resetToken) {
    throw new AppError("Token reset password tidak valid", 400);
  }
  if (resetToken.used_at) {
    throw new AppError("Link reset password ini sudah pernah digunakan", 400);
  }
  if (new Date(resetToken.expires_at).getTime() < Date.now()) {
    throw new AppError("Link reset password sudah kedaluwarsa, silakan minta link baru", 400);
  }

  const passwordHash = await hashPassword(password);
  await userRepository.updateById(resetToken.user_id, { password_hash: passwordHash });
  await passwordResetRepository.markUsed(resetToken.id);
  // Bersihkan sisa token lain (belum dipakai) milik user ini juga, kalau ada.
  await passwordResetRepository.deleteUnusedForUser(resetToken.user_id);

  logger.info("[authService] Password berhasil direset", { userId: resetToken.user_id });
}

module.exports = { register, login, refresh, toSafeUser, requestPasswordReset, resetPassword };
