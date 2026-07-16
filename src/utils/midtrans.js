const midtransClient = require("midtrans-client");
const crypto = require("crypto");
const env = require("../config/env");
const { AppError } = require("../utils/AppError");

/**
 * Wrapper Midtrans Snap reusable — satu-satunya tempat yang berinteraksi
 * langsung dengan SDK Midtrans. orderService memanggil ini tanpa perlu
 * tahu detail konfigurasi Midtrans.
 */
const snap = new midtransClient.Snap({
  isProduction: env.midtrans.isProduction,
  serverKey: env.midtrans.serverKey,
  clientKey: env.midtrans.clientKey,
});

/**
 * UPDATE 1 — Core API dipakai khusus untuk mengecek status transaksi Midtrans yang
 * sudah pernah dibuat (dipakai oleh orderService.continuePayment untuk memutuskan
 * apakah Snap Token lama masih bisa dipakai ulang atau harus dibuatkan yang baru).
 */
const core = new midtransClient.CoreApi({
  isProduction: env.midtrans.isProduction,
  serverKey: env.midtrans.serverKey,
  clientKey: env.midtrans.clientKey,
});

/**
 * Membuat Snap Token untuk satu order.
 * midtransOrderId harus unik (dipakai order_id di sisi Midtrans, berbeda dari orders.id internal
 * supaya bisa retry pembayaran tanpa bentrok "order_id already used").
 *
 * `finishRedirectUrl` diteruskan sebagai `callbacks.finish` ke Midtrans Snap. Tanpa ini,
 * tombol "Kembali ke Merchant" di halaman selesai Snap (dan redirect_url fallback-nya)
 * memakai Finish Redirect URL bawaan Midtrans (https://example.com) karena tidak pernah
 * di-override per-transaksi — itulah penyebab BUG 1 (redirect ke Example Domain).
 */
async function createSnapTransaction({ midtransOrderId, grossAmount, customerDetails, items, finishRedirectUrl }) {
  const parameter = {
    transaction_details: { order_id: midtransOrderId, gross_amount: grossAmount },
    customer_details: customerDetails,
    item_details: items,
    ...(finishRedirectUrl && { callbacks: { finish: finishRedirectUrl } }),
  };

  try {
    const transaction = await snap.createTransaction(parameter);
    return transaction.token;
  } catch (err) {
    throw new AppError(`Gagal membuat Snap Token: ${err.message}`, 502);
  }
}

/**
 * Verifikasi signature key dari payload Webhook Midtrans.
 * signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
 */
function verifySignature({ orderId, statusCode, grossAmount, signatureKey }) {
  const expected = crypto
    .createHash("sha512")
    .update(`${orderId}${statusCode}${grossAmount}${env.midtrans.serverKey}`)
    .digest("hex");
  return expected === signatureKey;
}

/**
 * UPDATE 1 — Mengecek status transaksi Midtrans yang tersimpan (dipakai sebelum
 * membuat Snap Transaction baru saat user menekan "Bayar Sekarang"/"Lanjutkan
 * Pembayaran"), supaya Snap Token lama yang masih berlaku (transaction_status
 * "pending" di sisi Midtrans) tetap dipakai ulang alih-alih membuat transaksi baru.
 *
 * Mengembalikan `null` (bukan melempar error) kalau transaksi tidak ditemukan (404)
 * atau Core API gagal dihubungi — caller menganggap ini sebagai "tidak valid lagi"
 * dan akan membuat Snap Transaction baru untuk order yang sama sebagai fallback aman.
 */
async function getTransactionStatus(midtransOrderId) {
  try {
    const status = await core.transaction.status(midtransOrderId);
    return status;
  } catch (err) {
    return null;
  }
}

module.exports = { createSnapTransaction, verifySignature, getTransactionStatus };
