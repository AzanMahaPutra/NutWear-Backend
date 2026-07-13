const { validationResult } = require("express-validator");
const { errorResponse } = require("../utils/response");

/**
 * Middleware reusable dipasang setelah array validator Express Validator
 * di setiap route (mis. router.post('/register', registerValidator, handleValidation, controller)).
 * Mengubah hasil validasi menjadi response error standar.
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, {
      statusCode: 422,
      message: "Data yang dikirim tidak valid",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

module.exports = { handleValidation };
