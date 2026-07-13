const { body, query } = require("express-validator");

const ORDER_STATUSES = [
  "menunggu_pembayaran",
  "sudah_dibayar",
  "diproses",
  "dikemas",
  "dikirim",
  "selesai",
  "dibatalkan",
  "expired",
  "refund",
];

const checkoutValidator = [
  body("addressId").isUUID().withMessage("addressId tidak valid"),
  // cartItemIds bersifat opsional (Update 5, Bagian B — fitur check item pada Cart):
  // jika dikirim, hanya item keranjang dengan id tersebut yang diproses menjadi pesanan,
  // sisanya tetap berada di keranjang. Jika tidak dikirim, seluruh isi keranjang diproses
  // (mempertahankan kompatibilitas dengan alur checkout lama).
  body("cartItemIds").optional().isArray({ min: 1 }).withMessage("cartItemIds harus berupa array"),
  body("cartItemIds.*").optional().isUUID().withMessage("cartItemIds tidak valid"),
];

const updateOrderStatusValidator = [
  body("status").isIn(ORDER_STATUSES).withMessage("Status pesanan tidak valid"),
];

/**
 * Validasi query filter halaman Pesanan Admin (GET /orders) dan tombol "Hapus Semua"
 * (DELETE /orders) — dipakai bersama karena keduanya menerima filter yang sama
 * (tanggal, bulan, tahun, status).
 */
const orderQueryFilterValidator = [
  query("date").optional({ checkFalsy: true }).isISO8601().withMessage("Format tanggal tidak valid (YYYY-MM-DD)"),
  query("month").optional({ checkFalsy: true }).isInt({ min: 1, max: 12 }).withMessage("Bulan tidak valid"),
  query("year").optional({ checkFalsy: true }).isInt({ min: 2000, max: 2100 }).withMessage("Tahun tidak valid"),
  query("status").optional({ checkFalsy: true }).isIn(ORDER_STATUSES).withMessage("Status pesanan tidak valid"),
];

module.exports = { ORDER_STATUSES, checkoutValidator, updateOrderStatusValidator, orderQueryFilterValidator };
