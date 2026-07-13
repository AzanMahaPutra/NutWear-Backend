const notificationRepository = require("../repositories/notificationRepository");
const userRepository = require("../repositories/userRepository");
const { AppError } = require("../utils/AppError");

// Label status pesanan — disinkronkan dengan ORDER_STATUS_LABEL di
// frontend/constants/order.ts supaya isi notifikasi konsisten dengan tampilan
// Riwayat Pesanan/Manajemen Pesanan.
const ORDER_STATUS_LABEL = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  sudah_dibayar: "Sudah Dibayar",
  diproses: "Sedang Diproses",
  dikemas: "Dikemas",
  dikirim: "Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  expired: "Expired",
  refund: "Refund",
};

const MONTH_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function formatDateLong(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${MONTH_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function toResponse(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    referenceId: row.reference_id,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

async function getNotifications(userId, { page = 1, pageSize = 20 } = {}) {
  const { data, total } = await notificationRepository.findAllByUser(userId, { page, pageSize });
  const unreadCount = await notificationRepository.countUnread(userId);
  return {
    items: data.map(toResponse),
    unreadCount,
    meta: { page: Number(page) || 1, pageSize: Number(pageSize) || 20, total },
  };
}

async function getUnreadCount(userId) {
  return notificationRepository.countUnread(userId);
}

async function markAsRead(userId, id) {
  const row = await notificationRepository.markRead(userId, id);
  if (!row) throw new AppError("Notifikasi tidak ditemukan", 404);
  return toResponse(row);
}

async function markAllAsRead(userId) {
  await notificationRepository.markAllRead(userId);
  return true;
}

/**
 * Notifikasi Status Pesanan (Update 1, Jenis 1) — hanya dikirim ke pemilik
 * pesanan, dipanggil dari orderService.updateOrderStatus setelah status berhasil diubah.
 */
async function notifyOrderStatus(order) {
  const label = ORDER_STATUS_LABEL[order.status] ?? order.status;
  const orderCode = `#${String(order.id).slice(0, 8).toUpperCase()}`;
  const verb =
    order.status === "dikirim"
      ? "telah berhasil dikirim"
      : order.status === "dibatalkan"
      ? "telah berhasil dibatalkan"
      : `telah diperbarui menjadi ${label}`;
  await notificationRepository.createForUser(order.userId, {
    type: "order_status",
    title: `Pesanan ${orderCode}`,
    message: `Pesanan ${orderCode} ${verb}.`,
    link: "/profile/riwayat-pesanan",
    referenceId: order.id,
  });
}

/**
 * Notifikasi New Arrival (Update 1, Jenis 2) — broadcast ke seluruh customer,
 * dipanggil saat produk baru dibuat dengan isNewArrival true, atau saat produk
 * existing diubah menjadi New Arrival (false -> true).
 */
async function notifyNewArrival(product) {
  const userIds = await userRepository.findAllCustomerIds();
  await notificationRepository.createForUsers(userIds, {
    type: "new_arrival",
    title: "Produk Baru!",
    message: `${product.namaProduk} kini tersedia sebagai New Arrival.`,
    link: `/produk/${product.slug}`,
    referenceId: product.id,
  });
}

/**
 * Notifikasi Promo Produk (Update 1, Jenis 3) — broadcast ke seluruh customer,
 * dipanggil saat harga promo produk dibuat/diperbarui. Periode promo hanya
 * disertakan jika admin mengisi promo_mulai/promo_selesai (kolom opsional).
 */
async function notifyPromo(product) {
  const userIds = await userRepository.findAllCustomerIds();
  const mulai = formatDateLong(product.promoMulai);
  const selesai = formatDateLong(product.promoSelesai);
  const periodeLine = mulai && selesai ? ` Periode Promo: ${mulai} - ${selesai}.` : "";
  await notificationRepository.createForUsers(userIds, {
    type: "promo",
    title: "Promo Baru!",
    message: `${product.namaProduk} sedang promo.${periodeLine}`,
    link: `/produk/${product.slug}`,
    referenceId: product.id,
  });
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyOrderStatus,
  notifyNewArrival,
  notifyPromo,
};
