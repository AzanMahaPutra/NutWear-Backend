const paymentRepository = require("../repositories/paymentRepository");
const orderRepository = require("../repositories/orderRepository");
const stockRepository = require("../repositories/stockRepository");
const notificationService = require("../services/notificationService");
const midtrans = require("../utils/midtrans");
const { AppError } = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Memetakan transaction_status Midtrans ke status pesanan internal NutWear
 * (sesuai daftar status di dokumen: Menunggu Pembayaran, Sudah Dibayar, Dibatalkan, Expired, Refund).
 *
 * BUG 2 — sebelumnya transaction_status "failure" tidak ditangani sama sekali dan jatuh
 * ke default "menunggu_pembayaran". Akibatnya notifikasi pembayaran gagal (failure) justru
 * membuat status pesanan terlihat seperti belum dibayar sama sekali, bukan gagal/dibatalkan.
 */
function mapMidtransStatusToOrderStatus(transactionStatus, fraudStatus) {
  if (transactionStatus === "capture") {
    return fraudStatus === "accept" ? "sudah_dibayar" : "dibatalkan";
  }
  switch (transactionStatus) {
    case "settlement":
      return "sudah_dibayar";
    case "pending":
      return "menunggu_pembayaran";
    case "deny":
    case "cancel":
    case "failure":
      return "dibatalkan";
    case "expire":
      return "expired";
    case "refund":
    case "partial_refund":
      return "refund";
    default:
      return "menunggu_pembayaran";
  }
}

/**
 * Urutan "kemajuan" status pesanan, dipakai untuk mencegah notifikasi Webhook yang datang
 * terlambat/duplikat/di luar urutan menimpa balik status yang sudah lebih maju.
 *
 * BUG 2 — INI PENYEBAB SEBENARNYA notifikasi Settlement tidak tersinkron ke website: handler
 * sebelumnya SELALU menimpa status order dengan status dari notifikasi yang baru diterima,
 * apa pun urutan kedatangannya. Midtrans mengirim notifikasi "pending" begitu Snap transaction
 * dibuat (mis. untuk VA/bank_transfer) DAN akan me-retry pengiriman notifikasi bila endpoint
 * webhook belum sempat membalas 2xx (timeout, deploy sedang berjalan, dst). Jika notifikasi
 * "pending" yang lama sampai/di-retry SETELAH notifikasi "settlement" sudah lebih dulu diproses
 * (urutan jaringan tidak dijamin berurutan), maka status order yang sudah "sudah_dibayar" akan
 * tertimpa balik menjadi "menunggu_pembayaran" — persis gejala BUG 2. Guard ini memastikan
 * status pesanan tidak pernah mundur akibat notifikasi yang datang belakangan.
 */
const ORDER_STATUS_RANK = {
  menunggu_pembayaran: 0,
  sudah_dibayar: 1,
  dibatalkan: 1,
  expired: 1,
  diproses: 2,
  dikemas: 3,
  dikirim: 4,
  selesai: 5,
  refund: 6,
};

/**
 * Menangani Webhook Midtrans (sesuai alur sistem poin 10-12 dokumen):
 * 1. Verifikasi signature_key — WAJIB, mencegah orang lain memalsukan notifikasi pembayaran.
 * 2. Cari order terkait lewat midtrans_order_id.
 * 3. Cek idempotensi — abaikan notifikasi yang persis sama (transaction_id + transaction_status)
 *    dengan yang terakhir tersimpan, supaya notifikasi duplikat/retry dari Midtrans tidak
 *    memicu efek samping berulang (mis. stok dikembalikan dua kali).
 * 4. Update tabel payments (selalu, untuk audit trail payment_type/transaction_id terbaru) +
 *    status order — hanya jika status baru bukan kemunduran (lihat ORDER_STATUS_RANK di atas).
 * 5. Jika pembayaran gagal/expired/dibatalkan DAN stok belum pernah dikembalikan untuk order
 *    ini, kembalikan stok yang sudah dikurangi saat checkout.
 */
async function handleMidtransNotification(payload) {
  const { order_id: midtransOrderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signatureKey } =
    payload;

  // LOGGING SEMENTARA (investigasi) — payload mentah yang benar-benar diterima backend.
  // Jangan log signature_key (sensitif); field lain aman untuk sandbox/troubleshooting.
  logger.info("[midtrans:webhook] notifikasi diterima", {
    order_id: midtransOrderId,
    transaction_id: payload.transaction_id,
    transaction_status: payload.transaction_status,
    fraud_status: payload.fraud_status,
    payment_type: payload.payment_type,
    status_code: statusCode,
    gross_amount: grossAmount,
  });

  const isValid = midtrans.verifySignature({ orderId: midtransOrderId, statusCode, grossAmount, signatureKey });
  logger.info("[midtrans:webhook] hasil verifikasi signature", { order_id: midtransOrderId, valid: isValid });
  if (!isValid) {
    // ROOT CAUSE PALING UMUM untuk "status di Midtrans Settlement tapi order di web tidak
    // berubah": gross_amount pada notifikasi Midtrans dikirim dalam format string dengan
    // 2 desimal (mis. "150000.00"), sama seperti yang dipakai di sini apa adanya (tidak
    // dibulatkan/di-parse ulang ke Number) — itu SUDAH benar di utils/midtrans.js. Namun jika
    // signature tetap tidak valid, kemungkinan besar MIDTRANS_SERVER_KEY di .env server yang
    // sedang berjalan BUKAN Server Key Sandbox yang sama dengan yang dipakai membuat transaksi
    // (mis. tertukar Production/Sandbox, atau ada spasi/newline tersisa saat copy-paste ke .env).
    logger.error("[midtrans:webhook] signature tidak valid — notifikasi ditolak", {
      order_id: midtransOrderId,
      status_code: statusCode,
      gross_amount: grossAmount,
    });
    throw new AppError("Signature key tidak valid — notifikasi ditolak", 403);
  }

  const order = await orderRepository.findByMidtransOrderId(midtransOrderId);
  logger.info("[midtrans:webhook] hasil pencarian order", {
    midtrans_order_id: midtransOrderId,
    order_found: Boolean(order),
    order_id: order?.id ?? null,
    order_status_sebelum: order?.status ?? null,
  });
  if (!order) {
    // ROOT CAUSE UMUM LAIN: midtrans_order_id pada notifikasi tidak cocok dengan yang
    // tersimpan di tabel payments — bisa terjadi kalau developer sempat membuat transaksi
    // Snap manual/duplikat langsung dari Midtrans Dashboard/Postman (order_id tidak pernah
    // disimpan ke tabel payments lewat alur checkout normal), bukan lewat POST /orders/checkout.
    throw new AppError("Order terkait notifikasi ini tidak ditemukan", 404);
  }

  const existingPayment = await paymentRepository.findByOrderId(order.id);

  // Idempotensi — notifikasi identik (transaction_id + transaction_status yang sama persis
  // dengan yang terakhir tersimpan) berarti ini adalah retry/duplikat dari Midtrans, bukan
  // perubahan status baru. Tetap balas sukses (tanpa efek samping) supaya Midtrans berhenti retry.
  if (
    existingPayment?.transaction_id &&
    existingPayment.transaction_id === payload.transaction_id &&
    existingPayment.transaction_status === payload.transaction_status
  ) {
    logger.info("[midtrans:webhook] notifikasi duplikat/retry — diabaikan tanpa efek samping", {
      order_id: order.id,
      transaction_id: payload.transaction_id,
    });
    return { orderId: order.id, status: order.status, duplicate: true };
  }

  const newOrderStatus = mapMidtransStatusToOrderStatus(payload.transaction_status, payload.fraud_status);

  const currentRank = ORDER_STATUS_RANK[order.status] ?? 0;
  const incomingRank = ORDER_STATUS_RANK[newOrderStatus] ?? 0;
  // "refund" selalu boleh diproses berapa pun tahap pesanan saat ini (bisa terjadi setelah
  // pesanan Diproses/Dikirim/Selesai), status lain hanya dipakai jika bukan kemunduran.
  const shouldAdvanceOrderStatus = newOrderStatus === "refund" || incomingRank >= currentRank;

  logger.info("[midtrans:webhook] hasil mapping status", {
    order_id: order.id,
    transaction_status: payload.transaction_status,
    fraud_status: payload.fraud_status,
    mapped_order_status: newOrderStatus,
    current_order_status: order.status,
    currentRank,
    incomingRank,
    shouldAdvanceOrderStatus,
  });

  const updatedPayment = await paymentRepository.updateByOrderId(order.id, {
    transaction_id: payload.transaction_id,
    payment_type: payload.payment_type,
    transaction_status: payload.transaction_status,
    fraud_status: payload.fraud_status,
    // Waktu settlement asli dari Midtrans (tersedia pada notifikasi settlement/capture) —
    // disimpan apa adanya dari payload webhook, terpisah dari `paid_at` yang mencatat kapan
    // sistem NutWear sendiri pertama kali menandai order "sudah_dibayar". Tidak di-hardcode:
    // hanya diisi kalau Midtrans memang mengirim field ini pada notifikasi tersebut.
    ...(payload.settlement_time && { settlement_time: payload.settlement_time }),
    ...(newOrderStatus === "sudah_dibayar" && shouldAdvanceOrderStatus && { paid_at: new Date().toISOString() }),
  });

  // ROOT CAUSE — sebelumnya hasil update tabel payments TIDAK PERNAH diperiksa. Supabase
  // `.update().eq(...).maybeSingle()` TIDAK melempar error kalau filter `.eq("order_id", ...)`
  // kebetulan tidak cocok dengan baris manapun (mis. order_id salah tipe/format, atau baris
  // payments untuk order ini belum pernah ter-insert saat checkout) — ia hanya mengembalikan
  // `data: null` tanpa error. Akibatnya webhook tetap membalas 200 OK ke Midtrans (sukses) dan
  // Midtrans berhenti retry, padahal TIDAK ADA baris yang benar-benar berubah — persis gejala
  // "Settlement di Midtrans tapi status di web tidak pernah berubah, tanpa error apapun".
  if (!updatedPayment) {
    logger.error("[midtrans:webhook] GAGAL SENYAP — update tabel payments tidak menemukan baris manapun", {
      order_id: order.id,
      midtrans_order_id: midtransOrderId,
    });
    throw new AppError(
      "Update data payment gagal: tidak ada baris payments yang cocok dengan order ini",
      500
    );
  }
  logger.info("[midtrans:webhook] tabel payments berhasil diperbarui", {
    order_id: order.id,
    transaction_id: updatedPayment.transaction_id,
    payment_type: updatedPayment.payment_type,
    transaction_status: updatedPayment.transaction_status,
    fraud_status: updatedPayment.fraud_status,
    settlement_time: updatedPayment.settlement_time,
    paid_at: updatedPayment.paid_at,
  });

  if (!shouldAdvanceOrderStatus) {
    logger.info("[midtrans:webhook] status order TIDAK dimajukan (notifikasi datang belakangan/kemunduran)", {
      order_id: order.id,
      current_order_status: order.status,
      incoming_status: newOrderStatus,
    });
    return { orderId: order.id, status: order.status, ignored: true };
  }

  const updatedOrder = await orderRepository.updateStatus(order.id, newOrderStatus);

  // ROOT CAUSE — sama seperti di atas: `.update().eq("id", orderId).maybeSingle()` pada
  // orderRepository.updateStatus juga TIDAK PERNAH diperiksa hasilnya sebelum ini. Kalau
  // `order.id` yang didapat dari findByMidtransOrderId ternyata tidak cocok dengan baris
  // manapun di tabel `orders` (id berbeda tipe/format, race condition dihapus admin, dsb),
  // query update ini akan "berhasil" (tanpa error) tapi TIDAK MENGUBAH APAPUN — inilah yang
  // membuat Pendapatan Dashboard (dihitung dari tabel `orders.status` juga, lihat
  // dashboardRepository.getTotalRevenue) bisa terlihat konsisten dengan payments yang sudah
  // ter-update di atas, sementara Riwayat Pesanan/Detail Pesanan/Halaman Admin — yang semua
  // membaca `orders.status` — tetap menampilkan "Menunggu Pembayaran".
  if (!updatedOrder) {
    logger.error("[midtrans:webhook] GAGAL SENYAP — update status order tidak menemukan baris manapun", {
      order_id: order.id,
      target_status: newOrderStatus,
    });
    throw new AppError("Update status order gagal: order dengan id tersebut tidak ditemukan saat update", 500);
  }
  logger.info("[midtrans:webhook] status order berhasil diperbarui", {
    order_id: order.id,
    status_baru: updatedOrder.status,
  });

  // Kembalikan stok jika pembayaran batal/gagal/expired (stok sudah dikurangi saat checkout),
  // dan hanya jika order belum berstatus dibatalkan/expired sebelumnya (mencegah stok
  // dikembalikan berulang kali kalau notifikasi serupa terkirim lebih dari sekali).
  if (["dibatalkan", "expired"].includes(newOrderStatus) && !["dibatalkan", "expired"].includes(order.status)) {
    for (const item of order.order_items) {
      await stockRepository.increaseStock(item.variant_id, item.quantity);
    }
    logger.info("[midtrans:webhook] stok dikembalikan", { order_id: order.id, jumlah_item: order.order_items.length });
  }

  // BUG 4 — Notifikasi User: sebelumnya hanya dikirim saat admin mengubah status pesanan
  // manual (orderService.updateOrderStatus), sehingga perubahan status via Webhook Midtrans
  // (mis. otomatis menjadi "Sudah Dibayar") tidak pernah membuat notifikasi ke user. Kegagalan
  // notifikasi tidak boleh menggagalkan pemrosesan webhook itu sendiri.
  notificationService
    .notifyOrderStatus({ id: order.id, userId: order.user_id, status: newOrderStatus })
    .catch((err) => logger.warn("[midtrans:webhook] gagal mengirim notifikasi user", { order_id: order.id, error: err.message }));

  return { orderId: order.id, status: newOrderStatus };
}

module.exports = { handleMidtransNotification, mapMidtransStatusToOrderStatus };
