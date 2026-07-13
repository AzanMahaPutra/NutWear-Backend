const { AppError } = require("../utils/AppError");

/**
 * Menangani request ke endpoint yang tidak terdaftar sama sekali.
 * Dipasang setelah semua route, sebelum errorHandler.
 */
function notFoundHandler(req, res, next) {
  next(new AppError(`Endpoint ${req.method} ${req.originalUrl} tidak ditemukan`, 404));
}

module.exports = { notFoundHandler };
