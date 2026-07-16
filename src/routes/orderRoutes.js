const express = require("express");
const orderController = require("../controllers/orderController");
const {
  checkoutValidator,
  updateOrderStatusValidator,
  orderQueryFilterValidator,
} = require("../validators/orderValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

// Customer
router.post("/checkout", checkoutValidator, handleValidation, orderController.checkout);
router.get("/my", orderController.getMyOrders);
router.get("/my/:id", orderController.getMyOrderById);
// Update 2, poin 1-3 — tombol "Batalkan Pesanan" (hanya pesanan milik sendiri).
router.post("/my/:id/cancel", orderController.cancelMyOrder);
// Update 1 — tombol "Bayar Sekarang"/"Lanjutkan Pembayaran" (hanya pesanan milik sendiri).
router.post("/my/:id/continue-payment", orderController.continueMyOrderPayment);

// Admin
router.get("/", requireRole("admin"), orderQueryFilterValidator, handleValidation, orderController.getAllOrders);
router.delete("/", requireRole("admin"), orderQueryFilterValidator, handleValidation, orderController.deleteOrdersByFilter);
router.get("/:id", requireRole("admin"), orderController.getOrderByIdAdmin);
router.delete("/:id", requireRole("admin"), orderController.deleteOrder);
router.patch("/:id/status", requireRole("admin"), updateOrderStatusValidator, handleValidation, orderController.updateStatus);

module.exports = router;
