const { errorResponse } = require("../utils/response");
const env = require("../config/env");
const logger = require("../utils/logger");

/**
 * Error handler global — dipasang paling akhir di app.js.
 * Menangkap semua error yang dilempar (AppError atau error tak terduga)
 * supaya format response error selalu konsisten dan stack trace tidak bocor di production.
 */
function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : "Terjadi kesalahan pada server";

  if (env.nodeEnv !== "production") {
    console.error(err);
  } else {
    // UPDATE 3 — Perbaikan bug Hero Banner: sebelumnya log production mencatat
    // `message` (pesan generik yang juga dikirim ke user) alih-alih pesan error
    // ASLI (`err.message`). Akibatnya penyebab sebenarnya (mis. error dari
    // Supabase Storage/DB) tidak bisa ditelusuri lewat log server. Sekarang log
    // selalu mencatat pesan & stack asli, sementara response ke user tetap pakai
    // `message` yang ramah (lihat errorResponse di bawah).
    logger.error(err.message, {
      statusCode,
      path: req.originalUrl,
      method: req.method,
      stack: err.stack,
    });
  }

  return errorResponse(res, {
    statusCode,
    message,
    errors: err.errors || undefined,
  });
}

module.exports = { errorHandler };
