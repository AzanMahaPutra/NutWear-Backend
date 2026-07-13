const express = require("express");
const bannerController = require("../controllers/bannerController");
const { bannerCreateValidator, bannerUpdateValidator } = require("../validators/bannerValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");

const router = express.Router();
const adminOnly = [requireAuth, requireRole("admin")];
const bannerFiles = upload.fields([
  { name: "backgroundImage", maxCount: 1 },
  { name: "brandLogo", maxCount: 1 },
]);

router.get("/", bannerController.getAll);
router.patch("/reorder", adminOnly, bannerController.reorder);
router.post("/", adminOnly, bannerFiles, bannerCreateValidator, handleValidation, bannerController.create);
router.put("/:id", adminOnly, bannerFiles, bannerUpdateValidator, handleValidation, bannerController.update);
router.delete("/:id", adminOnly, bannerController.remove);

module.exports = router;
