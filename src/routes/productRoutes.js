const express = require("express");
const productController = require("../controllers/productController");
const {
  productValidator,
  variantValidator,
  variantUpdateValidator,
  featureValidator,
  featureUpdateValidator,
  pairValidator,
  imagePairValidator,
} = require("../validators/productValidator");
const { handleValidation } = require("../middlewares/handleValidation");
const { requireAuth, requireRole } = require("../middlewares/authMiddleware");
const { upload } = require("../middlewares/uploadMiddleware");

const router = express.Router();
const adminOnly = [requireAuth, requireRole("admin")];

// Publik — dipakai halaman Shop & Detail Produk
router.get("/", productController.getAll);
router.get("/slug/:slug", productController.getBySlug);
router.get("/:id/pairs", productController.getPairs);

// Publik — Pasangan Produk per Foto Gallery (UPDATE 3), dipakai halaman "Pasangan Produk"
router.get("/images/:imageId/pairing-context", productController.getImagePairingContext);
router.get("/images/:imageId/pairs", productController.getImagePairs);

router.get("/:id", productController.getById);

// Admin — CRUD Produk
router.post("/", adminOnly, productValidator, handleValidation, productController.create);
router.put("/:id", adminOnly, productController.update);
router.delete("/:id", adminOnly, productController.remove);

// Admin — Varian
router.post("/:id/variants", adminOnly, variantValidator, handleValidation, productController.addVariant);
router.put("/variants/:variantId", adminOnly, variantUpdateValidator, handleValidation, productController.updateVariant);
router.delete("/variants/:variantId", adminOnly, productController.removeVariant);

// Admin — Upload gambar produk (Multer -> Supabase Storage). Body bisa menyertakan
// `warna` opsional: kalau diisi, ini upload/ganti "foto utama" khusus warna tsb.
router.post("/:id/images", adminOnly, upload.single("image"), productController.uploadImage);
router.delete("/images/:imageId", adminOnly, productController.removeImage);

// Admin — Fitur Produk dengan Gambar (UPDATE 4). Multer -> Supabase Storage, sama pola dengan foto produk.
router.post(
  "/:id/features",
  adminOnly,
  upload.single("image"),
  featureValidator,
  handleValidation,
  productController.addFeature
);
router.put(
  "/features/:featureId",
  adminOnly,
  upload.single("image"),
  featureUpdateValidator,
  handleValidation,
  productController.updateFeature
);
router.delete("/features/:featureId", adminOnly, productController.removeFeature);

// Admin — Pasangan Produk (relasi lama level Produk, dipertahankan untuk kompatibilitas)
router.post("/:id/pairs", adminOnly, pairValidator, handleValidation, productController.addPair);
router.delete("/:id/pairs/:pairedProductId", adminOnly, productController.removePair);

// Admin — Pasangan Produk per Foto Gallery (UPDATE 3)
router.post(
  "/images/:imageId/pairs",
  adminOnly,
  imagePairValidator,
  handleValidation,
  productController.addImagePair
);
router.delete("/images/:imageId/pairs/:pairedProductId", adminOnly, productController.removeImagePair);

module.exports = router;
