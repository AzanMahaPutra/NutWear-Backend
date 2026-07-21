const express = require("express");
const userController = require("../controllers/userController");
const addressController = require("../controllers/addressController");
const { updateProfileValidator, addressValidator, banUserValidator } = require("../validators/userValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(requireAuth); // seluruh route /users butuh login

router.get("/me/profile", userController.getProfile);
router.put("/me/profile", updateProfileValidator, handleValidation, userController.updateProfile);

router.get("/me/addresses", addressController.getAll);
router.post("/me/addresses", addressValidator, handleValidation, addressController.create);
router.put("/me/addresses/:id", addressValidator, handleValidation, addressController.update);
router.delete("/me/addresses/:id", addressController.remove);
router.patch("/me/addresses/:id/default", addressController.setDefault);

// Admin — Manajemen User (Manajemen Pelanggan)
router.get("/", requireRole("admin"), userController.getAllCustomers);
// UPDATE — Banned User: Admin melakukan banned terhadap user tertentu.
router.patch("/:id/ban", requireRole("admin"), banUserValidator, handleValidation, userController.banUser);

module.exports = router;
