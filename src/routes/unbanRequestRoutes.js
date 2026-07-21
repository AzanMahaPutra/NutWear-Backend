const express = require("express");
const unbanRequestController = require("../controllers/unbanRequestController");
const { submitUnbanRequestValidator } = require("../validators/unbanRequestValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

// Customer — hanya user berstatus "banned" yang boleh mengajukan (divalidasi di service).
router.post("/", submitUnbanRequestValidator, handleValidation, unbanRequestController.submit);
router.get("/my/latest", unbanRequestController.getMyLatest);

// Admin — halaman "Permohonan Unban".
router.get("/", requireRole("admin"), unbanRequestController.getAll);
router.patch("/:id/approve", requireRole("admin"), unbanRequestController.approve);
router.patch("/:id/reject", requireRole("admin"), unbanRequestController.reject);

module.exports = router;
