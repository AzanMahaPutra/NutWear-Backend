const { body } = require("express-validator");

const productValidator = [
  body("namaProduk").trim().isLength({ min: 3 }).withMessage("Nama produk minimal 3 karakter"),
  body("categoryId").isUUID().withMessage("Kategori tidak valid"),
  body("harga").isInt({ min: 100 }).withMessage("Harga tidak valid"),
  body("berat").isInt({ min: 1 }).withMessage("Berat tidak valid"),
  body("deskripsi").optional().isString(),
  body("hargaPromo").optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).withMessage("Harga promo tidak valid"),
  body("hargaPromoColor").optional({ checkFalsy: true }).isString(),
  body("promoMulai").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("Tanggal mulai promo tidak valid"),
  body("promoSelesai")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage("Tanggal selesai promo tidak valid"),
  body("isNewArrival").optional().isBoolean().withMessage("Status New Arrival tidak valid"),
  body("gender").trim().isIn(["pria", "wanita", "uniseks"]).withMessage("Gender produk wajib dipilih"),
  // UPDATE 5 — Detail Produk dapat Dikelola per Produk. Semua opsional (boleh kosong,
  // frontend menampilkan "Informasi belum tersedia." kalau kosong).
  body("detailInfo").optional({ nullable: true, checkFalsy: true }).isString(),
  body("materialCareInfo").optional({ nullable: true, checkFalsy: true }).isString(),
  body("shippingReturnInfo").optional({ nullable: true, checkFalsy: true }).isString(),
  body("productionInfo").optional({ nullable: true, checkFalsy: true }).isString(),
];

const variantValidator = [
  body("ukuran").trim().notEmpty().withMessage("Ukuran wajib diisi"),
  body("warna").trim().notEmpty().withMessage("Warna wajib diisi"),
  body("sku").trim().notEmpty().withMessage("SKU wajib diisi"),
  body("stok").isInt({ min: 0 }).withMessage("Stok tidak valid"),
];

/** Update varian bersifat partial — semua field opsional, hanya divalidasi jika dikirim. */
const variantUpdateValidator = [
  body("ukuran").optional({ checkFalsy: true }).trim().notEmpty().withMessage("Ukuran tidak boleh kosong"),
  body("warna").optional({ checkFalsy: true }).trim().notEmpty().withMessage("Warna tidak boleh kosong"),
  body("sku").optional({ checkFalsy: true }).trim().notEmpty().withMessage("SKU tidak boleh kosong"),
  body("stok").optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage("Stok tidak valid"),
];

/**
 * UPDATE 4 — Fitur Produk dengan Gambar. Gambar divalidasi terpisah (req.file) di controller.
 * UPDATE 6 — Judul Fitur tidak lagi digunakan, jadi tidak divalidasi lagi di sini.
 */
const featureValidator = [
  body("deskripsi").trim().isLength({ min: 3 }).withMessage("Deskripsi fitur minimal 3 karakter"),
];

/** Update fitur bersifat partial — semua field opsional, hanya divalidasi jika dikirim. Gambar opsional (bisa tidak diganti). */
const featureUpdateValidator = [
  body("deskripsi")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3 })
    .withMessage("Deskripsi fitur minimal 3 karakter"),
  body("sortOrder").optional({ checkFalsy: true }).isInt({ min: 0 }).withMessage("Urutan tidak valid"),
];

const pairValidator = [body("sku").trim().notEmpty().withMessage("SKU wajib diisi")];

/** UPDATE 3 — Pasangan Produk per Foto Gallery: dipasangkan lewat pilihan produk (dropdown searchable), bukan SKU. */
const imagePairValidator = [body("productId").isUUID().withMessage("Produk pasangan wajib dipilih")];

module.exports = {
  productValidator,
  variantValidator,
  variantUpdateValidator,
  featureValidator,
  featureUpdateValidator,
  pairValidator,
  imagePairValidator,
};
