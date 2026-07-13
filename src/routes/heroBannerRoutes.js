const express = require("express");
const heroBannerController = require("../controllers/heroBannerController");
const { heroBannerCreateValidator, heroBannerUpdateValidator } = require("../validators/heroBannerValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");

const router = express.Router();
const adminOnly = [requireAuth, requireRole("admin")];
const uploadImage = upload.single("image");

router.get("/", heroBannerController.getAll);
router.patch("/reorder", adminOnly, heroBannerController.reorder);
router.post("/", adminOnly, uploadImage, heroBannerCreateValidator, handleValidation, heroBannerController.create);
router.put("/:id", adminOnly, uploadImage, heroBannerUpdateValidator, handleValidation, heroBannerController.update);
router.delete("/:id", adminOnly, heroBannerController.remove);

module.exports = router;
