const dashboardRepository = require("../repositories/dashboardRepository");

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

/**
 * Mengelompokkan order menjadi total penjualan per bulan (untuk Grafik Penjualan Admin).
 */
function buildMonthlySalesChart(orders) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTH_LABELS[d.getMonth()], total: 0 });
  }

  orders.forEach((order) => {
    const d = new Date(order.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const bucket = months.find((m) => m.key === key);
    if (bucket) bucket.total += order.grand_total;
  });

  return months.map(({ label, total }) => ({ bulan: label, total }));
}

/**
 * Mengagregasi order_items menjadi daftar produk terlaris berdasarkan total quantity terjual.
 */
function buildBestsellerList(orderItems, limit = 5) {
  const map = new Map();

  orderItems.forEach((item) => {
    const product = item.product_variants?.products;
    if (!product) return;
    const existing = map.get(product.id) || { productId: product.id, namaProduk: product.nama_produk, totalTerjual: 0 };
    existing.totalTerjual += item.quantity;
    map.set(product.id, existing);
  });

  return Array.from(map.values())
    .sort((a, b) => b.totalTerjual - a.totalTerjual)
    .slice(0, limit);
}

async function getDashboardSummary() {
  const [totalProduk, totalPelanggan, totalPesanan, pendapatan, monthlyOrders, orderItems] = await Promise.all([
    dashboardRepository.countProducts(),
    dashboardRepository.countCustomers(),
    dashboardRepository.countOrders(),
    dashboardRepository.getTotalRevenue(),
    dashboardRepository.getMonthlySales(),
    dashboardRepository.getOrderItemsWithProduct(),
  ]);

  return {
    stats: { totalProduk, totalPelanggan, totalPesanan, pendapatan },
    salesChart: buildMonthlySalesChart(monthlyOrders),
    bestsellers: buildBestsellerList(orderItems),
  };
}

module.exports = { getDashboardSummary };
