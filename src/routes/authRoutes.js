const express = require("express");
const authController = require("../controllers/authController");
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} = require("../validators/authValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post("/register", authLimiter, registerValidator, handleValidation, authController.register);
router.post("/login", authLimiter, loginValidator, handleValidation, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.post(
  "/forgot-password",
  authLimiter,
  forgotPasswordValidator,
  handleValidation,
  authController.forgotPassword
);
router.post("/reset-password", authLimiter, resetPasswordValidator, handleValidation, authController.resetPassword);

module.exports = router;
