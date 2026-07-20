const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const routes = require("./routes");
const { notFoundHandler } = require("./middlewares/notFoundHandler");
const { errorHandler } = require("./middlewares/errorHandler");

const app = express();

// Percayai header X-Forwarded-* saat backend diakses lewat reverse proxy/tunnel
// (mis. Cloudflare Tunnel ketika menguji Notification/Webhook Midtrans secara lokal).
// Wajib diaktifkan (TRUST_PROXY=1) di kondisi itu, kalau tidak express-rate-limit akan
// melempar error ERR_ERL_UNEXPECTED_X_FORWARDED_FOR begitu ada header X-Forwarded-For.
if (env.trustProxy) {
  app.set("trust proxy", 1);
}

// Keamanan dasar & optimisasi (disiapkan sejak awal, bukan hanya "nanti di Fase 4",
// supaya tidak ada kejutan struktural saat production-ready).
app.use(helmet());
app.use(compression());
app.use(
  cors({
    // FRONTEND_URL bisa berisi beberapa origin dipisah koma (lihat config/env.js).
    // Request tanpa Origin header (mis. panggilan server-to-server dari Midtrans ke
    // endpoint webhook) tidak dikenai pengecekan CORS oleh browser sama sekali, jadi
    // tidak perlu — dan tidak boleh — didaftarkan di sini.
    //
    // Selain exact-match ke frontendUrls, kita juga terima origin dari preview
    // deployment Vercel milik project yang sama (lihat vercelPreviewOriginRegex
    // di config/env.js) — supaya testing di URL preview/branch tidak keblokir
    // CORS setiap kali Vercel bikin URL baru.
    origin(origin, callback) {
      if (!origin) return callback(null, true); // server-to-server, curl, dll — bukan browser
      if (env.frontendUrls.includes(origin)) return callback(null, true);
      if (env.vercelPreviewOriginRegex?.test(origin)) return callback(null, true);
      return callback(new Error(`Origin tidak diizinkan oleh CORS: ${origin}`));
    },
    credentials: true, // supaya cookie refresh token bisa dikirim cross-origin
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.nodeEnv !== "test") {
  app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));
}

// Rate limiter global — mencegah brute force / abuse.
// Endpoint sensitif (auth) bisa diberi limiter lebih ketat di route masing-masing bila perlu.
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
