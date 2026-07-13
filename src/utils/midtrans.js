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

module.exports = { createSnapTransaction, verifySignature };
