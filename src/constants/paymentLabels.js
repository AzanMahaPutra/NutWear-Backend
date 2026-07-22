/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel.
 *
 * Label metode & status pembayaran untuk kolom "Metode Pembayaran"/"Status Pembayaran"
 * pada file Excel (dibuat di backend, jadi tidak bisa memakai konstanta frontend).
 * Sengaja disalin PERSIS dari `frontend/constants/order.ts` (PAYMENT_TYPE_LABEL /
 * PAYMENT_STATUS_LABEL) supaya label yang tampil di file Excel konsisten dengan yang
 * tampil di halaman Detail Pesanan Admin — bukan daftar baru yang bisa tidak sinkron.
 * Key mengikuti nilai payment_type / transaction_status apa adanya dari Midtrans.
 */

const PAYMENT_TYPE_LABEL = {
  credit_card: "Kartu Kredit/Debit",
  bank_transfer: "Transfer Bank (Virtual Account)",
  echannel: "Mandiri Bill (Echannel)",
  gopay: "GoPay",
  shopeepay: "ShopeePay",
  qris: "QRIS",
  cstore: "Gerai Retail (Indomaret/Alfamart)",
  akulaku: "Akulaku PayLater",
  kredivo: "Kredivo",
};

const PAYMENT_STATUS_LABEL = {
  capture: "Pembayaran Diterima",
  settlement: "Pembayaran Berhasil",
  pending: "Menunggu Pembayaran",
  deny: "Pembayaran Ditolak",
  cancel: "Pembayaran Dibatalkan",
  expire: "Pembayaran Kedaluwarsa",
  failure: "Pembayaran Gagal",
  refund: "Dana Dikembalikan",
  partial_refund: "Dana Dikembalikan Sebagian",
};

module.exports = { PAYMENT_TYPE_LABEL, PAYMENT_STATUS_LABEL };
