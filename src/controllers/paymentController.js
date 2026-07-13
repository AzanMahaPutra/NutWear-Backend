const paymentService = require("../services/paymentService");
const { successResponse } = require("../utils/response");
const { asyncHandler } = require("../utils/asyncHandler");
const logger = require("../utils/logger");

/**
 * Endpoint ini dipanggil oleh server Midtrans (bukan oleh frontend),
 * jadi tidak dilindungi requireAuth — keamanannya bersandar sepenuhnya
 * pada verifikasi signature_key di paymentService.
 */
const midtransWebhook = asyncHandler(async (req, res) => {
  // LOGGING SEMENTARA (investigasi) — kalau baris ini TIDAK PERNAH muncul di log server
  // sama sekali saat pembayaran sandbox diselesaikan, artinya request dari Midtrans tidak
  // pernah sampai ke backend ini (paling sering karena Notification URL di Midtrans Sandbox
  // Dashboard masih kosong/salah, atau mengarah ke alamat yang tidak bisa diakses publik,
  // mis. http://localhost:4000 — server Midtrans tidak bisa menjangkau localhost developer).
  logger.info("[midtrans:webhook] request masuk ke POST /payments/midtrans/webhook", {
    order_id: req.body?.order_id,
    transaction_status: req.body?.transaction_status,
  });

  const result = await paymentService.handleMidtransNotification(req.body);

  logger.info("[midtrans:webhook] request selesai diproses, membalas 200 OK ke Midtrans", {
    order_id: req.body?.order_id,
    result,
  });

  return successResponse(res, { message: "Notifikasi berhasil diproses", data: result });
});

module.exports = { midtransWebhook };
