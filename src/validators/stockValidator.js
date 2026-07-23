const { body, query } = require("express-validator");

const adjustStockValidator = [
  body("quantity").isInt({ min: 1 }).withMessage("Jumlah harus lebih dari 0"),
  body("type").isIn(["in", "out"]).withMessage("Tipe harus 'in' atau 'out'"),
];

// UPDATE — Notifikasi Stok Menipis untuk Admin (Pengaturan Batas Minimum Stok).
const updateMinimumStockValidator = [
  body("minimumStock").isInt({ min: 1 }).withMessage("Batas minimum stok harus berupa angka bulat lebih dari 0"),
];

// UPDATE — Halaman Inventory Stock Admin.
const inventoryQueryValidator = [
  query("search").optional().isString().trim().isLength({ max: 150 }).withMessage("Kata kunci pencarian tidak valid"),
  query("status").optional({ checkFalsy: true }).isIn(["aman", "menipis", "habis"]).withMessage("Filter status stok tidak valid"),
  query("page").optional().isInt({ min: 1 }).withMessage("Halaman tidak valid"),
  query("pageSize").optional().isInt({ min: 1, max: 100 }).withMessage("Ukuran halaman tidak valid"),
];

// Validasi "Stok Baru" dari modal Edit Stok / tombol Quick Adjustment — hanya
// menerima angka bulat, tidak boleh kosong/negatif/huruf (sesuai dokumen
// permintaan bagian "VALIDASI").
const setStockValidator = [
  body("stokBaru").notEmpty().withMessage("Stok wajib diisi").bail().isInt({ min: 0 }).withMessage("Stok harus berupa angka dan tidak boleh negatif"),
];

module.exports = { adjustStockValidator, updateMinimumStockValidator, inventoryQueryValidator, setStockValidator };
