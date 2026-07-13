const express = require("express");
const cartController = require("../controllers/cartController");
const { addCartValidator, updateCartValidator } = require("../validators/cartValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

router.get("/", cartController.getAll);
router.post("/", addCartValidator, handleValidation, cartController.add);
router.put("/:id", updateCartValidator, handleValidation, cartController.update);
router.delete("/:id", cartController.remove);
router.delete("/", cartController.clear);

module.exports = router;
