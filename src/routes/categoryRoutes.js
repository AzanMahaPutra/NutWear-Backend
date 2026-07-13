const express = require("express");
const categoryController = require("../controllers/categoryController");
const { categoryValidator } = require("../validators/categoryValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");

const router = express.Router();
const adminOnly = [requireAuth, requireRole("admin")];
const uploadImage = upload.single("image");

// Publik
router.get("/", categoryController.getAll);
router.get("/:id", categoryController.getById);

// Admin — create & update memakai multipart/form-data supaya bisa upload gambar
router.post("/", adminOnly, uploadImage, categoryValidator, handleValidation, categoryController.create);
router.put("/:id", adminOnly, uploadImage, categoryValidator, handleValidation, categoryController.update);
router.delete("/:id", adminOnly, categoryController.remove);

module.exports = router;
