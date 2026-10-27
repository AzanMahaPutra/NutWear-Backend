const unbanRequestRepository = require("../repositories/unbanRequestRepository");
const userRepository = require("../repositories/userRepository");
const notificationService = require("./notificationService");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function toResponse(request) {
  return {
    id: request.id,
    userId: request.user_id,
    namaUser: request.users?.nama_lengkap ?? null,
    email: request.users?.email ?? null,
    bannedReason: request.banned_reason_snapshot,
    requestReason: request.request_reason,
    status: request.status, // 'menunggu' | 'disetujui' | 'ditolak'
    createdAt: request.created_at,
    processedAt: request.processed_at,
  };
}

/**
 * Customer mengajukan permohonan unban. Hanya boleh dilakukan oleh user yang
 * sedang berstatus "banned", dan hanya satu permohonan aktif ("menunggu")
 * pada satu waktu (lihat CHANGELOG.md untuk skenario pengujian).
 */
async function submitRequest(userId, requestReason) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError("Pengguna tidak ditemukan", 404);
  if (user.status !== "banned") {
    throw new AppError("Hanya akun yang sedang dibanned yang dapat mengajukan permohonan unban", 400);
  }

  const pending = await unbanRequestRepository.findPendingByUser(userId);
  if (pending) {
    throw new AppError("Anda masih memiliki permohonan unban yang sedang menunggu diproses", 409);
  }

  const created = await unbanRequestRepository.create({
    userId,
    requestReason,
    bannedReasonSnapshot: user.banned_reason,
  });
  return toResponse(created);
}

/** Permohonan unban terbaru milik user yang sedang login — dipakai halaman
 * Profile untuk menonaktifkan tombol "Ajukan" kalau masih ada yang menunggu. */
async function getMyLatestRequest(userId) {
  const latest = await unbanRequestRepository.findLatestByUser(userId);
  return latest ? toResponse(latest) : null;
}

// UPDATE 09 — search (nama/email) + filter status + pagination; mengembalikan { data, meta }.
async function getAllRequests({ search, status, page, limit } = {}) {
  const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_PAGE_SIZE));
  const { data, total } = await unbanRequestRepository.findPage({ search, status, page: pageNum, limit: limitNum });
  return {
    data: data.map(toResponse),
    meta: { page: pageNum, limit: limitNum, total, totalPages: Math.max(1, Math.ceil(total / limitNum)) },
  };
}

async function getRequestOrThrow(id) {
  const request = await unbanRequestRepository.findById(id);
  if (!request) throw new AppError("Permohonan unban tidak ditemukan", 404);
  return request;
}

/**
 * Admin menyetujui permohonan — status akun kembali "aktif" (seluruh fitur bisa
 * dipakai lagi) dan status permohonan menjadi "disetujui".
 */
async function approveRequest(adminId, requestId) {
  const request = await getRequestOrThrow(requestId);
  if (request.status !== "menunggu") {
    throw new AppError("Permohonan ini sudah pernah diproses", 400);
  }

  await userRepository.unbanUser(request.user_id);
  const updated = await unbanRequestRepository.updateStatus(requestId, {
    status: "disetujui",
    processedBy: adminId,
  });

  // UPDATE — Notifikasi Banned User: dikirim setelah status akun & permohonan
  // berhasil diperbarui. Kegagalan pengiriman notifikasi tidak menggagalkan
  // persetujuan permohonan itu sendiri.
  try {
    await notificationService.notifyUnbanApproved(request.user_id);
  } catch {
    // sengaja tidak melempar ulang.
  }

  return toResponse(updated);
}

/**
 * Admin menolak permohonan — status akun TETAP "banned". User baru bisa
 * mengajukan permohonan baru setelah permohonan ini selesai diproses (statusnya
 * sudah bukan "menunggu" lagi), sesuai skenario pengujian di CHANGELOG.md.
 */
async function rejectRequest(adminId, requestId) {
  const request = await getRequestOrThrow(requestId);
  if (request.status !== "menunggu") {
    throw new AppError("Permohonan ini sudah pernah diproses", 400);
  }

  const updated = await unbanRequestRepository.updateStatus(requestId, {
    status: "ditolak",
    processedBy: adminId,
  });

  // UPDATE — Notifikasi Banned User: kegagalan pengiriman notifikasi tidak
  // menggagalkan penolakan permohonan itu sendiri.
  try {
    await notificationService.notifyUnbanRejected(request.user_id);
  } catch {
    // sengaja tidak melempar ulang.
  }

  return toResponse(updated);
}

/**
 * UPDATE 09 — Admin menghapus permohonan dari daftar. Aturan bisnis:
 *  - Hanya permohonan yang SUDAH diproses (disetujui/ditolak) yang boleh dihapus. Permohonan
 *    "menunggu" harus disetujui/ditolak dulu: menghapusnya diam-diam akan membuang banding
 *    pengguna tanpa keputusan dan tanpa notifikasi.
 *  - Yang dihapus hanya baris permohonan. Akun pengguna (termasuk status banned/aktif), notifikasi,
 *    dan data transaksi tidak disentuh.
 */
async function deleteRequest(adminId, requestId) {
  const request = await getRequestOrThrow(requestId);
  if (request.status === "menunggu") {
    throw new AppError("Permohonan yang masih menunggu harus disetujui atau ditolak terlebih dahulu sebelum dihapus", 409);
  }

  const deleted = await unbanRequestRepository.deleteProcessedById(requestId);
  if (!deleted) throw new AppError("Permohonan unban tidak ditemukan atau sudah dihapus", 404);

  logger.info("[unbanRequestService] Admin menghapus permohonan unban", {
    adminId,
    requestId,
    userId: request.user_id,
    status: request.status,
  });
  return { id: requestId };
}

module.exports = { submitRequest, getMyLatestRequest, getAllRequests, approveRequest, rejectRequest, deleteRequest };
