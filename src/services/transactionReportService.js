const ExcelJS = require("exceljs");
const transactionReportRepository = require("./../repositories/transactionReportRepository");
const orderService = require("./orderService");
const { PAYMENT_STATUS_LABEL, PAYMENT_TYPE_LABEL } = require("../constants/paymentLabels");
const { STATUS_GROUPS, ORDER_STATUS_LABEL, groupOfStatus } = require("../constants/transactionReport");
const { AppError } = require("../utils/AppError");
const { csvLine, csvPreamble } = require("../utils/csv");

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
 * Data halaman Laporan Transaksi (server-side pagination — poin "Performa" pada dokumen:
 * query backend, tidak memuat seluruh transaksi ke frontend).
 * UPDATE 07: ringkasan angka dipindah ke getAnalytics (endpoint terpisah) — `summary` tidak
 * lagi dihitung di sini supaya tiap pindah halaman/ketik search tidak memicu query agregat berat.
 */
async function getReport(filters, { page, limit } = {}) {
  const currentPage = clampPage(page);
  const pageSize = clampLimit(limit);

  const { data, total, searchTruncated } = await transactionReportRepository.findOrders(filters, {
    page: currentPage,
    limit: pageSize,
  });

  return {
    data: data.map(orderService.toResponse),
    meta: {
      page: currentPage,
      limit: pageSize,
      total,
      totalPages: total > 0 ? Math.ceil(total / pageSize) : 0,
      searchTruncated,
    },
  };
}

// ---------------------------------------------------------------------------
// UPDATE 07 — Analitik (Statistik / Diagram / Distribusi)
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_BUCKETS = 92; // lebih dari ini -> dikelompokkan per bulan

/** `created_at` bertipe `timestamp` (tanpa zona) dari Postgres = waktu UTC; pastikan terbaca sebagai UTC. */
function toUtcDate(value) {
  if (!value) return null;
  const text = String(value);
  const hasZone = /(Z|[+-]\d{2}(:?\d{2})?)$/.test(text);
  const date = new Date(hasZone ? text : `${text.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const monthKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;

function startOfUtcDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Daftar kunci bucket (hari/bulan) yang berurutan dari `from` s.d. `to` (inklusif), tanpa celah. */
function buildBucketKeys(from, to, granularity) {
  const keys = [];
  if (granularity === "day") {
    for (let t = startOfUtcDay(from).getTime(); t <= startOfUtcDay(to).getTime(); t += DAY_MS) {
      keys.push(dayKey(new Date(t)));
    }
  } else {
    let y = from.getUTCFullYear();
    let m = from.getUTCMonth();
    const endY = to.getUTCFullYear();
    const endM = to.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      keys.push(`${y}-${pad(m + 1)}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
  }
  return keys;
}

/**
 * Data untuk tiga mode chart. SEMUA angka dihitung dari data transaksi aktual pada rentang
 * tanggal filter yang SAMA dengan tabel & ekspor (buildReportDateRange).
 *
 * Aturan pendapatan (sama dengan Dashboard Admin): hanya status pada kelompok "paid"
 * (sudah_dibayar, diproses, dikemas, dikirim, selesai) dan memakai `grand_total`.
 * Transaksi menunggu pembayaran, gagal/dibatalkan/expired, dan refund DIHITUNG TERPISAH
 * (jumlah & nilainya) dan TIDAK masuk pendapatan.
 *
 * Pengelompokan hari/bulan memakai tanggal UTC — konsisten dengan batas filter tanggal.
 */
async function getAnalytics(filters = {}) {
  const [orders, itemsSold] = await Promise.all([
    transactionReportRepository.findOrdersForAnalytics(filters),
    transactionReportRepository.sumPaidItemQuantity(filters),
  ]);

  const groups = {};
  Object.keys(STATUS_GROUPS).forEach((key) => {
    groups[key] = { count: 0, amount: 0 };
  });
  const byStatus = new Map();
  const byMethod = new Map();
  const paidPoints = []; // { date, amount } untuk tren

  let minDate = null;
  let maxDate = null;

  orders.forEach((order) => {
    const date = toUtcDate(order.created_at);
    const amount = order.grand_total || 0;
    if (date) {
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    }

    const status = order.status;
    const entry = byStatus.get(status) ?? { count: 0, amount: 0 };
    entry.count += 1;
    entry.amount += amount;
    byStatus.set(status, entry);

    const group = groupOfStatus(status);
    if (group) {
      groups[group].count += 1;
      groups[group].amount += amount;
    }

    if (group === "paid") {
      if (date) paidPoints.push({ date, amount });
      const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
      const methodKey = payment?.payment_type || "tidak_tercatat";
      const method = byMethod.get(methodKey) ?? { count: 0, amount: 0 };
      method.count += 1;
      method.amount += amount;
      byMethod.set(methodKey, method);
    }
  });

  // --- Tren: rentang bucket = rentang filter (dibatasi sampai hari ini) atau rentang data ---
  const range = transactionReportRepository.buildReportDateRange(filters);
  const today = startOfUtcDay(new Date());
  let from = null;
  let to = null;
  if (range) {
    from = new Date(range.start);
    to = new Date(new Date(range.end).getTime() - DAY_MS); // `end` bersifat eksklusif
    if (to > today) to = today; // jangan menampilkan ekor hari-hari di masa depan
    if (from > to) to = from;
  } else if (minDate && maxDate) {
    from = minDate;
    to = maxDate;
  }

  let granularity = "day";
  let trend = [];
  if (from && to) {
    const spanDays = Math.floor((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / DAY_MS) + 1;
    granularity = spanDays > MAX_DAILY_BUCKETS ? "month" : "day";
    const keyOf = granularity === "day" ? dayKey : monthKey;
    const buckets = new Map(buildBucketKeys(from, to, granularity).map((k) => [k, { key: k, revenue: 0, transactions: 0 }]));
    paidPoints.forEach(({ date, amount }) => {
      const bucket = buckets.get(keyOf(date));
      if (bucket) {
        bucket.revenue += amount;
        bucket.transactions += 1;
      }
    });
    trend = [...buckets.values()];
  }

  const revenue = groups.paid.amount;
  const paidCount = groups.paid.count;
  const totalOrders = orders.length;

  const groupList = Object.keys(STATUS_GROUPS).map((key) => ({
    key,
    label: STATUS_GROUPS[key].label,
    count: groups[key].count,
    amount: groups[key].amount,
  }));

  return {
    range: range ? { start: range.start, end: range.end } : null,
    granularity,
    kpi: {
      revenue,
      paidCount,
      averageOrderValue: paidCount > 0 ? Math.round(revenue / paidCount) : 0,
      itemsSold,
      totalOrders,
      pendingCount: groups.pending.count,
      pendingAmount: groups.pending.amount,
      failedCount: groups.failed.count,
      failedAmount: groups.failed.amount,
      refundCount: groups.refund.count,
      refundAmount: groups.refund.amount,
      successRate: totalOrders > 0 ? Math.round((paidCount / totalOrders) * 1000) / 10 : 0,
    },
    trend,
    distribution: {
      byGroup: groupList,
      byStatus: [...byStatus.entries()].map(([status, v]) => ({
        key: status,
        label: ORDER_STATUS_LABEL[status] ?? status,
        group: groupOfStatus(status),
        count: v.count,
        amount: v.amount,
      })),
      byPaymentMethod: [...byMethod.entries()]
        .map(([key, v]) => ({
          key,
          label: key === "tidak_tercatat" ? "Tidak tercatat" : (PAYMENT_TYPE_LABEL[key] ?? key),
          count: v.count,
          amount: v.amount,
        }))
        .sort((x, y) => y.count - x.count),
    },
  };
}

// ---------------------------------------------------------------------------
// UPDATE 07 — Ekspor CSV (transaksi terpilih / seluruh hasil filter)
// ---------------------------------------------------------------------------

/** Batas keras jumlah baris ekspor "seluruh hasil filter" (melindungi server dari ekspor tak terbatas). */
const CSV_EXPORT_MAX_ROWS = 10000;
const CSV_BATCH_SIZE = 500;

/**
 * Kolom CSV — HANYA yang relevan untuk laporan transaksi. SENGAJA tidak menyertakan data
 * pribadi yang tidak diperlukan: email, nomor HP, dan alamat pengiriman tidak diekspor.
 * Yang ada hanya nama pelanggan (untuk rekonsiliasi). Tidak ada kolom diskon/voucher karena
 * model aktual belum memilikinya.
 */
const CSV_HEADERS = [
  "Nomor Transaksi",
  "Tanggal (UTC)",
  "Nama Pelanggan",
  "Status Pesanan",
  "Status Pembayaran",
  "Metode Pembayaran",
  "Jumlah Item",
  "Produk",
  "Subtotal Produk (Rp)",
  "Ongkos Kirim (Rp)",
  "Total (Rp)",
  "Dihitung Sebagai Pendapatan",
];

function formatUtcDateTime(value) {
  const date = toUtcDate(value);
  if (!date) return "";
  return `${dayKey(date)} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** Satu transaksi = satu baris CSV. Hanya MEMBACA data order — tidak ada perubahan status. */
function orderToCsvRow(order) {
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  const itemCount = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const productSummary = items
    .map((item) => {
      const name = item.product_name ?? item.product_variants?.products?.nama_produk ?? "-";
      return `${name} x${item.quantity || 0}`;
    })
    .join("; ");

  return [
    order.id,
    formatUtcDateTime(order.created_at),
    order.users?.nama_lengkap ?? "-",
    ORDER_STATUS_LABEL[order.status] ?? order.status,
    payment?.transaction_status ? (PAYMENT_STATUS_LABEL[payment.transaction_status] ?? payment.transaction_status) : "-",
    payment?.payment_type ? (PAYMENT_TYPE_LABEL[payment.payment_type] ?? payment.payment_type) : "-",
    itemCount,
    productSummary,
    order.total_price ?? 0,
    order.shipping_cost ?? 0,
    order.grand_total ?? 0,
    groupOfStatus(order.status) === "paid" ? "Ya" : "Tidak",
  ];
}

/**
 * Menyiapkan ekspor: memvalidasi & menghitung SEBELUM header HTTP dikirim, sehingga error
 * (mis. tidak ada data / terlalu banyak) tetap menjadi respons JSON biasa.
 * Mengembalikan `{ total, writeTo(res) }`.
 *
 * mode "selected": `ids` (sudah divalidasi UUID & maksimal 100 oleh validator) — hanya
 *                  transaksi yang ada di database yang diekspor.
 * mode "filtered": seluruh hasil filter (tanggal, status, search, sorting) yang sama dengan tabel.
 */
async function prepareCsvExport({ mode, ids, filters }) {
  if (mode === "selected") {
    const uniqueIds = [...new Set(ids)];
    const orders = await transactionReportRepository.findOrdersByIds(uniqueIds);
    if (orders.length === 0) throw new AppError("Transaksi yang dipilih tidak ditemukan", 404);
    return {
      total: orders.length,
      async writeTo(res) {
        res.write(csvPreamble(CSV_HEADERS));
        orders.forEach((order) => res.write(csvLine(orderToCsvRow(order))));
      },
    };
  }

  const total = await transactionReportRepository.countOrders(filters);
  if (total === 0) throw new AppError("Tidak ada transaksi yang cocok dengan filter untuk diekspor", 404);
  if (total > CSV_EXPORT_MAX_ROWS) {
    throw new AppError(
      `Hasil filter terlalu banyak (${total} transaksi). Persempit filter hingga maksimal ${CSV_EXPORT_MAX_ROWS} transaksi.`,
      400
    );
  }

  return {
    total,
    async writeTo(res) {
      const search = await transactionReportRepository.resolveSearch(filters.search);
      res.write(csvPreamble(CSV_HEADERS));
      for (let page = 1; ; page += 1) {
        const batch = await transactionReportRepository.findOrdersBatch(filters, search, page, CSV_BATCH_SIZE);
        batch.forEach((order) => res.write(csvLine(orderToCsvRow(order))));
        if (batch.length < CSV_BATCH_SIZE) break;
      }
    },
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
  getAnalytics,
  prepareCsvExport,
  orderToCsvRow,
  CSV_HEADERS,
  CSV_EXPORT_MAX_ROWS,
  exportToExcel,
};
