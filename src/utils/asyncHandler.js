/**
 * Membungkus async controller supaya error otomatis diteruskan ke next()
 * tanpa perlu menulis try-catch berulang di setiap controller.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
