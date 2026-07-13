const express = require("express");
const notificationController = require("../controllers/notificationController");
const { requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

router.get("/", notificationController.getAll);
router.get("/unread-count", notificationController.getUnreadCount);
router.patch("/read-all", notificationController.markAllRead);
router.patch("/:id/read", notificationController.markRead);

module.exports = router;
