const ExcelJS = require("exceljs");
const transactionReportRepository = require("./../repositories/transactionReportRepository");
const orderService = require("./orderService");
const { PAYMENT_STATUS_LABEL, PAYMENT_TYPE_LABEL } = require("../constants/paymentLabels");

/**
 * UPDATE — Halaman Laporan Transaksi & Export Excel.
 *
 * `toResponse` dari orderService dipakai ulang di sini (BUKAN ditulis ulang) supaya
 * bentuk satu transaksi pada Laporan Transaksi PERSIS SAMA dengan bentuk `Order` yang
 * sudah dikenal frontend di halaman Pesanan Admin (customer, items, shippingAddress,
 * payment, dst) — frontend cukup memakai ulang tipe `Order` yang sudah ada.
 */

const REPORT_PAGE_SIZE_DEFAULT = 20;
const REPORT_PAGE_SIZE_MAX = 100;
const EXPORT_BATCH_SIZE = 200;

function clampPage(page) {
  const n = Number(page);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function clampLimit(limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return REPORT_PAGE_SIZE_DEFAULT;
  return Math.min(Math.floor(n), REPORT_PAGE_SIZE_MAX);
}

/**
 * Data + ringkasan halaman Laporan Transaksi (server-side pagination — poin
 * "Performa" pada dokumen: query backend, tidak memuat seluruh transaksi ke frontend).
 */
async function getReport(filters, { page, limit } = {}) {
  const currentPage = clampPage(page);
  const pageSize = clampLimit(limit);

  const [{ data, total }, summary] = await Promise.all([
    transactionReportRepository.findPaidOrders(filters, { page: currentPage, limit: pageSize }),
    transactionReportRepository.getSummary(filters),
  ]);

  return {
    data: data.map(orderService.toResponse),
    meta: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
    },
    summary,
  };
}

const EXCEL_HEADERS = [
  { header: "Order ID", key: "orderId", width: 24 },
  { header: "Tanggal", key: "tanggal", width: 14 },
  { header: "Nama Customer", key: "namaCustomer", width: 22 },
  { header: "Email", key: "email", width: 26 },
  { header: "Nomor HP", key: "noHp", width: 16 },
  { header: "Produk", key: "produk", width: 28 },
  { header: "Warna", key: "warna", width: 12 },
  { header: "Ukuran", key: "ukuran", width: 10 },
  { header: "Jumlah", key: "jumlah", width: 10 },
  { header: "Harga", key: "harga", width: 14 },
  { header: "Subtotal", key: "subtotal", width: 14 },
  { header: "Ongkos Kirim", key: "ongkir", width: 14 },
  { header: "Diskon", key: "diskon", width: 12 },
  { header: "Grand Total", key: "grandTotal", width: 16 },
  { header: "Metode Pembayaran", key: "metodePembayaran", width: 22 },
  { header: "Status Pembayaran", key: "statusPembayaran", width: 20 },
];

function formatDateForExcel(isoString) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/**
 * Menulis satu order (beserta seluruh order_items-nya) sebagai baris-baris Excel.
 * Data order/pengiriman/pembayaran DIULANG di setiap baris produk (denormalized)
 * supaya tiap baris Excel tetap bisa berdiri sendiri saat difilter/dijumlah admin
 * di Excel, sesuai daftar kolom yang diminta dokumen (Order ID s.d. Status Pembayaran
 * pada tiap baris).
 *
 * CATATAN — Diskon & Voucher: skema database project ini (`orders`/`order_items`)
 * belum punya kolom diskon/voucher sama sekali (lihat backend/src/database/schema.sql).
 * Mengikuti aturan "jangan melakukan refactor besar" & "gunakan struktur database yang
 * sudah ada", kolom "Diskon" tetap ditampilkan sesuai permintaan tapi diisi Rp0 (belum
 * ada fitur diskon/voucher berjalan) — bukan mengarang data atau membuat skema baru.
 * Kolom "Voucher" pada dokumen digabung ke catatan yang sama, lihat CHANGELOG.md.
 */
function writeOrderRows(worksheet, order) {
  const items = order.order_items && order.order_items.length > 0 ? order.order_items : [null];
  const customerName = order.users?.nama_lengkap ?? "-";
  const customerEmail = order.users?.email ?? "-";
  const customerPhone = order.users?.no_hp ?? "-";
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const paymentType = payment?.payment_type ? (PAYMENT_TYPE_LABEL[payment.payment_type] ?? payment.payment_type) : "-";
  const paymentStatus = payment?.transaction_status
    ? (PAYMENT_STATUS_LABEL[payment.transaction_status] ?? payment.transaction_status)
    : "-";

  items.forEach((item) => {
    worksheet
      .addRow({
        orderId: order.id,
        tanggal: formatDateForExcel(order.created_at),
        namaCustomer: customerName,
        email: customerEmail,
        noHp: customerPhone,
        produk: item?.product_name ?? item?.product_variants?.products?.nama_produk ?? "-",
        warna: item?.variant_warna ?? item?.product_variants?.warna ?? "-",
        ukuran: item?.variant_ukuran ?? item?.product_variants?.ukuran ?? "-",
        jumlah: item?.quantity ?? 0,
        harga: item?.price ?? 0,
        subtotal: item ? item.price * item.quantity : 0,
        ongkir: order.shipping_cost,
        diskon: 0,
        grandTotal: order.grand_total,
        metodePembayaran: paymentType,
        statusPembayaran: paymentStatus,
      })
      .commit();
  });
}

/**
 * Streaming Export Excel — mengambil data per batch (EXPORT_BATCH_SIZE) langsung dari
 * repository lalu menuliskannya ke response stream memakai ExcelJS Streaming Writer.
 * Baik query database maupun penulisan file TIDAK PERNAH menahan seluruh transaksi di
 * memori sekaligus, supaya proses export tetap cepat walau data sudah ribuan (poin
 * "Performa" pada dokumen).
 */
async function exportToExcel(res, filters) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  const worksheet = workbook.addWorksheet("Laporan Transaksi");
  worksheet.columns = EXCEL_HEADERS;
  worksheet.getRow(1).font = { bold: true };

  let page = 1;
  let totalTransaksi = 0;
  let totalPendapatan = 0;
  let totalProdukTerjual = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await transactionReportRepository.findPaidOrdersBatch(filters, page, EXPORT_BATCH_SIZE);
    if (!batch || batch.length === 0) break;

    batch.forEach((order) => {
      totalTransaksi += 1;
      totalPendapatan += order.grand_total || 0;
      (order.order_items || []).forEach((item) => {
        totalProdukTerjual += item.quantity || 0;
      });
      writeOrderRows(worksheet, order);
    });

    if (batch.length < EXPORT_BATCH_SIZE) break;
    page += 1;
  }

  worksheet.addRow({}).commit();
  const summaryRow1 = worksheet.addRow({ orderId: "Total Transaksi", tanggal: totalTransaksi });
  summaryRow1.font = { bold: true };
  summaryRow1.commit();
  const summaryRow2 = worksheet.addRow({ orderId: "Total Pendapatan", tanggal: totalPendapatan });
  summaryRow2.font = { bold: true };
  summaryRow2.commit();
  const summaryRow3 = worksheet.addRow({ orderId: "Total Produk Terjual", tanggal: totalProdukTerjual });
  summaryRow3.font = { bold: true };
  summaryRow3.commit();

  worksheet.commit();
  await workbook.commit();
}

module.exports = {
  getReport,
  exportToExcel,
};
