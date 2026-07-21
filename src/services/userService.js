const userRepository = require("../repositories/userRepository");
const orderRepository = require("../repositories/orderRepository");
const reviewRepository = require("../repositories/reviewRepository");
const { AppError } = require("../utils/AppError");

function toResponse(user) {
  return {
    id: user.id,
    namaLengkap: user.nama_lengkap,
    email: user.email,
    noHp: user.no_hp,
    role: user.role,
    // UPDATE — Banned User: status akun ("aktif" | "banned") & alasan banned
    // ikut dikirim supaya frontend bisa menampilkan pesan/pembatasan yang tepat.
    status: user.status ?? "aktif",
    bannedReason: user.banned_reason ?? null,
    bannedAt: user.banned_at ?? null,
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

// UPDATE — Halaman Manajemen User Admin: selain data profil, ditambahkan
// Status Akun, Total Pesanan, dan Total Review per user (lihat CHANGELOG.md).
async function getAllCustomers() {
  const customers = await userRepository.findAllCustomers();
  return Promise.all(
    customers.map(async (c) => {
      const [orderCount, reviewCount] = await Promise.all([
        orderRepository.countByUser(c.id),
        reviewRepository.countByUser(c.id),
      ]);
      return {
        id: c.id,
        namaLengkap: c.nama_lengkap,
        email: c.email,
        noHp: c.no_hp,
        joinedAt: c.created_at,
        status: c.status ?? "aktif",
        bannedReason: c.banned_reason ?? null,
        bannedAt: c.banned_at ?? null,
        orderCount,
        reviewCount,
      };
    })
  );
}

// UPDATE — Banned User: dipanggil Admin dari halaman Manajemen User.
// `adminId` (req.user.id) dicatat sebagai `banned_by` untuk keperluan riwayat.
async function banUser(adminId, userId, reason) {
  const target = await userRepository.findById(userId);
  if (!target) throw new AppError("Pengguna tidak ditemukan", 404);
  if (target.role === "admin") throw new AppError("Akun Admin tidak dapat dibanned", 400);
  if (target.status === "banned") throw new AppError("Akun ini sudah berstatus Banned", 400);

  const updated = await userRepository.banUser(userId, { reason, bannedBy: adminId });
  return toResponse(updated);
}

module.exports = { getProfile, updateProfile, getAllCustomers, banUser, toResponse };
