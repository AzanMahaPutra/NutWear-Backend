const userRepository = require("../repositories/userRepository");
const { hashPassword, comparePassword } = require("../utils/password");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { AppError } = require("../utils/AppError");

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

module.exports = { register, login, refresh, toSafeUser };
