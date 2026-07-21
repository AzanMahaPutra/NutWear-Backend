const express = require("express");
const wishlistController = require("../controllers/wishlistController");
const { addWishlistValidator } = require("../validators/wishlistValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, blockIfBanned } = require("../middlewares/authMiddleware");

const router = express.Router();
router.use(requireAuth);

router.get("/", wishlistController.getAll);
// UPDATE — Banned User: user yang dibanned tidak boleh menambah wishlist.
router.post("/", blockIfBanned, addWishlistValidator, handleValidation, wishlistController.add);
router.delete("/:productId", wishlistController.remove);

module.exports = router;
