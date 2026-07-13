require("dotenv").config();
const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  console.log(`NutWear API berjalan di http://localhost:${env.port}`);
  console.log(`Environment: ${env.nodeEnv}`);
  // BACKEND_PUBLIC_URL (lihat .env) — saat diisi dengan URL Cloudflare Tunnel, log ini
  // langsung menunjukkan URL Webhook Midtrans yang benar untuk ditempel ke Midtrans
  // Sandbox Dashboard. Lihat CHANGELOG.md untuk langkah lengkapnya.
  console.log(`Midtrans Webhook URL: ${env.backendPublicUrl}/api/v1/payments/midtrans/webhook`);
  if (env.backendPublicUrl.includes("localhost") || env.backendPublicUrl.includes("127.0.0.1")) {
    console.log(
      "Catatan: BACKEND_PUBLIC_URL masih mengarah ke localhost — Midtrans TIDAK BISA mengirim " +
        "Notification/Webhook ke alamat ini. Jalankan Cloudflare Tunnel lalu isi BACKEND_PUBLIC_URL " +
        "dengan URL yang diberikan (lihat CHANGELOG.md)."
    );
  }
});
