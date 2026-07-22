const { supabase } = require("../config/supabase");
const { AppError } = require("../utils/AppError");

/**
 * Status pesanan yang dihitung sebagai "sudah benar-benar dibayar" untuk Pendapatan,
 * Grafik Penjualan, dan statistik Dashboard Admin lainnya. Sengaja TIDAK termasuk
 * menunggu_pembayaran/pending/expired/dibatalkan sesuai aturan bisnis (order dokumen).
 *
 * BUG 3 — sebelumnya getTotalRevenue() hanya menghitung status "selesai", padahal
 * getMonthlySales() sudah benar menghitung sejak "sudah_dibayar". Akibatnya Pendapatan
 * di Dashboard Admin tidak bertambah begitu pembayaran berhasil (order baru berstatus
 * "sudah_dibayar", bukan langsung "selesai"), berbeda dari Grafik Penjualan yang sudah
 * ikut berubah. Kedua fungsi sekarang memakai daftar status yang sama.
 */
const PAID_ORDER_STATUSES = ["sudah_dibayar", "diproses", "dikemas", "dikirim", "selesai"];

async function countProducts() {
  const { count, error } = await supabase.from("products").select("*", { count: "exact", head: true });
  if (error) throw new AppError(error.message, 500);
  return count;
}

async function countCustomers() {
  const { count, error } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", "customer");
  if (error) throw new AppError(error.message, 500);
  return count;
}

async function countOrders() {
  const { count, error } = await supabase.from("orders").select("*", { count: "exact", head: true });
  if (error) throw new AppError(error.message, 500);
  return count;
}

async function getTotalRevenue() {
  const { data, error } = await supabase.from("orders").select("grand_total").in("status", PAID_ORDER_STATUSES);
  if (error) throw new AppError(error.message, 500);
  return data.reduce((sum, o) => sum + o.grand_total, 0);
}

/**
 * Grafik penjualan per bulan (12 bulan terakhir), dihitung dari order_items x price
 * pada order yang sudah dibayar/selesai.
 */
async function getMonthlySales() {
  const { data, error } = await supabase.from("orders").select("grand_total, created_at").in("status", PAID_ORDER_STATUSES);
  if (error) throw new AppError(error.message, 500);
  return data;
}

async function getOrderItemsWithProduct() {
  const { data, error } = await supabase
    .from("order_items")
    .select("quantity, price, product_variants ( product_id, products ( id, nama_produk ) )");
  if (error) throw new AppError(error.message, 500);
  return data;
}

module.exports = {
  // UPDATE — Laporan Transaksi & Export Excel: PAID_ORDER_STATUSES diekspor supaya
  // transactionReportRepository bisa memakai definisi "sudah benar-benar dibayar" yang
  // SAMA PERSIS dengan yang sudah dipakai Pendapatan/Grafik Penjualan Dashboard Admin di
  // atas, bukan mendefinisikan ulang daftar status secara terpisah (berisiko keduanya
  // tidak sinkron di kemudian hari). Tidak mengubah perilaku Dashboard sama sekali.
  PAID_ORDER_STATUSES,
  countProducts,
  countCustomers,
  countOrders,
  getTotalRevenue,
  getMonthlySales,
  getOrderItemsWithProduct,
};
