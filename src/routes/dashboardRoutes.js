const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

router.get("/summary", dashboardController.getSummary);

module.exports = router;
