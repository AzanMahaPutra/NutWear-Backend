const express = require("express");
const reviewController = require("../controllers/reviewController");
const { createReviewValidator } = require("../validators/reviewValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/product/:productId", reviewController.getByProduct);
router.post("/", requireAuth, createReviewValidator, handleValidation, reviewController.create);

// Admin — moderasi
router.get("/", requireAuth, requireRole("admin"), reviewController.getAll);
router.delete("/:id", requireAuth, requireRole("admin"), reviewController.remove);

module.exports = router;
