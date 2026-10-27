const { body } = require("express-validator");

const LINK_TYPES = ["none", "product", "category", "custom"];

/**
 * Field opsional yang sama untuk create & update (hanya divalidasi jika dikirim).
 */
const optionalFields = [
  body("title").optional({ checkFalsy: true }).isString().trim(),
  body("linkType").optional({ checkFalsy: true }).isIn(LINK_TYPES).withMessage("Jenis tujuan link tidak valid"),
  body("productId")
    .if(body("linkType").equals("product"))
    .isUUID()
    .withMessage("Produk tujuan wajib dipilih"),
  body("categoryId")
    .if(body("linkType").equals("category"))
    .isUUID()
    .withMessage("Kategori tujuan wajib dipilih"),
  body("customUrl")
    .if(body("linkType").equals("custom"))
    .trim()
    .isLength({ min: 1 })
    .withMessage("Link tujuan wajib diisi"),
  body("isActive").optional({ checkFalsy: true }).isBoolean(),
  body("sortOrder").optional({ checkFalsy: true }).isInt(),
];

const heroBannerCreateValidator = [...optionalFields];
const heroBannerUpdateValidator = [...optionalFields];

/**
 * Body: { orderedIds: string[] } — SEMUA id hero banner dalam urutan akhir (hasil drag & drop).
 * Di sini hanya cek bentuk + keunikan; cek id milik tabel & kelengkapan dilakukan
 * atomik di database (fungsi reorder_hero_banners).
 */
const heroBannerReorderValidator = [
  body("orderedIds").isArray({ min: 1, max: 500 }).withMessage("Daftar urutan wajib berupa array (maks. 500 item)"),
  body("orderedIds.*").isUUID().withMessage("Id pada daftar urutan tidak valid"),
  body("orderedIds").custom((ids) => !Array.isArray(ids) || new Set(ids).size === ids.length).withMessage("Daftar urutan berisi id ganda"),
];

module.exports = { heroBannerCreateValidator, heroBannerUpdateValidator, heroBannerReorderValidator, LINK_TYPES };
