const userRepository = require("../repositories/userRepository");
const { AppError } = require("../utils/AppError");

function toResponse(user) {
  return {
    id: user.id,
    namaLengkap: user.nama_lengkap,
    email: user.email,
    noHp: user.no_hp,
    role: user.role,
  };
}

async function getProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError("Pengguna tidak ditemukan", 404);
  return toResponse(user);
}

async function updateProfile(userId, { namaLengkap, noHp }) {
  const existing = await userRepository.findById(userId);
  if (!existing) throw new AppError("Pengguna tidak ditemukan", 404);
  const fields = {
    ...(namaLengkap && { nama_lengkap: namaLengkap }),
    ...(noHp && { no_hp: noHp }),
  };
  if (Object.keys(fields).length === 0) return toResponse(existing);
  const updated = await userRepository.updateById(userId, fields);
  if (!updated) throw new AppError("Pengguna tidak ditemukan", 404);
  return toResponse(updated);
}

async function getAllCustomers() {
  const customers = await userRepository.findAllCustomers();
  return customers.map((c) => ({
    id: c.id,
    namaLengkap: c.nama_lengkap,
    email: c.email,
    noHp: c.no_hp,
    joinedAt: c.created_at,
  }));
}

module.exports = { getProfile, updateProfile, getAllCustomers, toResponse };
