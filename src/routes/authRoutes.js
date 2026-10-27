const express = require("express");
const authController = require("../controllers/authController");
const {
  registerValidator,
  loginValidator,
  loginStatusValidator,
  forgotPasswordValidator,
  googleLoginValidator,
} = require("../validators/authValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth } = require("../middlewares/authMiddleware");
const { authLimiter, loginLimiters, loginStatusLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

router.post("/register", authLimiter, registerValidator, handleValidation, authController.register);
// UPDATE #1 — /login memakai loginLimiters (batas + cooldown, store terpusat), bukan authLimiter
// yang dipakai bersama register/google/forgot-password.
router.post("/login", ...loginLimiters, loginValidator, handleValidation, authController.login);
// UPDATE 11 — Status blokir login (READ-ONLY, publik karena dipakai halaman Login sebelum masuk).
// Tidak ada endpoint untuk mereset/membuka blokir — blokir hanya berakhir karena waktunya habis.
// POST (bukan GET) supaya email tidak ikut tercatat di URL/access log.
router.post("/login/status", loginStatusLimiter, loginStatusValidator, handleValidation, authController.loginStatus);
// UPDATE — Login dengan Google: OAuth-nya sendiri (redirect ke Google, tukar
// code jadi session) sepenuhnya terjadi di browser lewat Supabase Auth
// (lihat frontend/app/auth/callback). Endpoint ini dipanggil frontend SETELAH
// itu, hanya untuk sinkronisasi baris profil `users` & mengisi cookie refresh
// token — sama seperti /login, bukan endpoint OAuth redirect itu sendiri.
router.post("/google", authLimiter, googleLoginValidator, handleValidation, authController.googleLogin);
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
// Route "/reset-password" DIHAPUS — Langkah 2 Forgot Password sekarang
// ditangani langsung oleh frontend memakai Supabase Auth
// (`supabase.auth.updateUser`), bukan lagi lewat backend. Lihat authController.js.

module.exports = router;
