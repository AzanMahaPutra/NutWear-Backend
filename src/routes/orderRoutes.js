const express = require("express");
const orderController = require("../controllers/orderController");
const {
  checkoutValidator,
  updateOrderStatusValidator,
  orderQueryFilterValidator,
  orderSearchSuggestionsValidator,
} = require("../validators/orderValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole, blockIfBanned } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

// Customer
// UPDATE — Banned User: user yang dibanned tidak boleh Checkout.
router.post("/checkout", blockIfBanned, checkoutValidator, handleValidation, orderController.checkout);
router.get("/my", orderController.getMyOrders);
router.get("/my/:id", orderController.getMyOrderById);
// Update 2, poin 1-3 — tombol "Batalkan Pesanan" (hanya pesanan milik sendiri).
router.post("/my/:id/cancel", orderController.cancelMyOrder);
// Update 1 — tombol "Bayar Sekarang"/"Lanjutkan Pembayaran" (hanya pesanan milik sendiri).
router.post("/my/:id/continue-payment", orderController.continueMyOrderPayment);

// Admin
router.get("/", requireRole("admin"), orderQueryFilterValidator, handleValidation, orderController.getAllOrders);
router.delete("/", requireRole("admin"), orderQueryFilterValidator, handleValidation, orderController.deleteOrdersByFilter);
// UPDATE — Search Order ID: didaftarkan SEBELUM "/:id" supaya path ini tidak
// tertangkap sebagai parameter :id oleh route detail pesanan di bawahnya.
router.get(
  "/search-suggestions",
  requireRole("admin"),
  orderSearchSuggestionsValidator,
  handleValidation,
  orderController.getOrderSearchSuggestions
);
router.get("/:id", requireRole("admin"), orderController.getOrderByIdAdmin);
router.delete("/:id", requireRole("admin"), orderController.deleteOrder);
router.patch("/:id/status", requireRole("admin"), updateOrderStatusValidator, handleValidation, orderController.updateStatus);

module.exports = router;
