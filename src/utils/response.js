/**
 * Formatter response API yang konsisten di seluruh endpoint.
 * Dipakai oleh semua controller supaya bentuk response seragam
 * dan frontend bisa mengasumsikan struktur yang sama untuk setiap request.
 */
function successResponse(res, { statusCode = 200, message = "Success", data = null, meta = null }) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function errorResponse(res, { statusCode = 500, message = "Terjadi kesalahan", errors = null }) {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

module.exports = { successResponse, errorResponse };
