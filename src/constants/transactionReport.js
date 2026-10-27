/**
 * UPDATE 07 — Laporan Transaksi: definisi kelompok status transaksi.
 *
 * Model aktual proyek: SATU kolom `orders.status` (lihat schema.sql + paymentService.js
 * yang memetakan status Midtrans ke status pesanan). Tidak ada tabel/kolom refund atau
 * "gagal" terpisah — keduanya adalah nilai `orders.status`:
 *   - "dibatalkan"  : dibatalkan user/admin ATAU pembayaran ditolak/gagal/cancel (Midtrans deny/failure/cancel)
 *   - "expired"     : pembayaran kedaluwarsa
 *   - "refund"      : dana dikembalikan (Midtrans refund/partial_refund)
 *
 * PENDAPATAN hanya dihitung dari kelompok "paid" — daftar yang SAMA PERSIS dengan
 * Dashboard Admin (dashboardRepository.PAID_ORDER_STATUSES), diimpor, bukan disalin.
 */
const { PAID_ORDER_STATUSES } = require("../repositories/dashboardRepository");

const STATUS_GROUPS = {
  paid: { label: "Berhasil Dibayar", statuses: PAID_ORDER_STATUSES },
  pending: { label: "Menunggu Pembayaran", statuses: ["menunggu_pembayaran"] },
  failed: { label: "Gagal / Dibatalkan", statuses: ["dibatalkan", "expired"] },
  refund: { label: "Refund", statuses: ["refund"] },
};

/** Nilai `statusGroup` yang valid pada filter tabel ("all" = semua status, tanpa pembatasan). */
const STATUS_GROUP_FILTERS = [...Object.keys(STATUS_GROUPS), "all"];

/** Default tabel = hanya transaksi berhasil dibayar (perilaku halaman sebelum UPDATE 07). */
const DEFAULT_STATUS_GROUP = "paid";

/** Label status pesanan — disalin dari frontend/constants/order.ts (ORDER_STATUS_LABEL). */
const ORDER_STATUS_LABEL = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  sudah_dibayar: "Sudah Dibayar",
  diproses: "Diproses",
  dikemas: "Dikemas",
  dikirim: "Dikirim",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  expired: "Expired",
  refund: "Refund",
};

/** Kelompok dari satu status pesanan; status yang tidak dikenal -> null. */
function groupOfStatus(status) {
  return Object.keys(STATUS_GROUPS).find((key) => STATUS_GROUPS[key].statuses.includes(status)) ?? null;
}

/** Hanya kolom yang aman dipakai sebagai ORDER BY (whitelist). */
const SORT_FIELDS = { tanggal: "created_at", total: "grand_total" };

module.exports = {
  STATUS_GROUPS,
  STATUS_GROUP_FILTERS,
  DEFAULT_STATUS_GROUP,
  ORDER_STATUS_LABEL,
  SORT_FIELDS,
  groupOfStatus,
};
