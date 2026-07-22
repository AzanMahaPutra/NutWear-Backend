const express = require("express");
const authRoutes = require("./authRoutes");
const userRoutes = require("./userRoutes");
const categoryRoutes = require("./categoryRoutes");
const productRoutes = require("./productRoutes");
const bannerRoutes = require("./bannerRoutes");
const heroBannerRoutes = require("./heroBannerRoutes");
const wishlistRoutes = require("./wishlistRoutes");
const cartRoutes = require("./cartRoutes");
const orderRoutes = require("./orderRoutes");
const paymentRoutes = require("./paymentRoutes");
const reviewRoutes = require("./reviewRoutes");
const stockRoutes = require("./stockRoutes");
const dashboardRoutes = require("./dashboardRoutes");
const notificationRoutes = require("./notificationRoutes");
const unbanRequestRoutes = require("./unbanRequestRoutes");
// UPDATE — Laporan Transaksi & Export Excel.
const transactionReportRoutes = require("./transactionReportRoutes");

const router = express.Router();

/**
 * Root router — titik pusat pendaftaran seluruh route modul.
 * Modul baru cukup ditambahkan di sini tanpa mengubah app.js.
 */
router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/categories", categoryRoutes);
router.use("/products", productRoutes);
router.use("/banners", bannerRoutes);
router.use("/hero-banners", heroBannerRoutes);
router.use("/wishlist", wishlistRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/payments", paymentRoutes);
router.use("/reviews", reviewRoutes);
router.use("/stock", stockRoutes);
router.use("/admin/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
// UPDATE — Banned User & Pengajuan Unban.
router.use("/unban-requests", unbanRequestRoutes);
// UPDATE — Laporan Transaksi & Export Excel.
router.use("/transaction-reports", transactionReportRoutes);

router.get("/health", (req, res) => {
  res.json({ success: true, message: "NutWear API is running" });
});

module.exports = router;
