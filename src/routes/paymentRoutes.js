const express = require("express");
const paymentController = require("../controllers/paymentController");

const router = express.Router();

// Webhook Midtrans — TIDAK pakai requireAuth (dipanggil server Midtrans, bukan user login).
// Keamanan bersandar pada verifikasi signature_key di paymentService.
router.post("/midtrans/webhook", paymentController.midtransWebhook);

module.exports = router;
