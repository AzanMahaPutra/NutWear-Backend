const stockRepository = require("../repositories/stockRepository");
const productRepository = require("../repositories/productRepository");
const { AppError } = require("../utils/AppError");

/**
 * Business logic penyesuaian stok manual oleh admin (mis. restock, koreksi stok opname).
 * Terpisah dari pengurangan stok otomatis saat checkout (lihat orderService).
 */
async function adjustStock(variantId, { quantity, type }) {
  const variant = await productRepository.findVariantById(variantId);
  if (!variant) throw new AppError("Varian tidak ditemukan", 404);

  if (type === "in") {
    await stockRepository.increaseStock(variantId, quantity);
  } else if (type === "out") {
    await stockRepository.decreaseStock(variantId, quantity);
  } else {
    throw new AppError("Tipe penyesuaian stok tidak valid", 400);
  }

  return productRepository.findVariantById(variantId);
}

async function getStockLogs(variantId) {
  return stockRepository.findLogsByVariant(variantId);
}

/**
 * UPDATE — Notifikasi Stok Menipis untuk Admin.
 */
async function getMinimumStock() {
  return stockRepository.getMinimumStock();
}

async function updateMinimumStock(rawValue) {
  const minimumStock = Number(rawValue);
  if (!Number.isInteger(minimumStock) || minimumStock < 1) {
    throw new AppError("Batas minimum stok harus berupa angka bulat lebih dari 0", 400);
  }
  return stockRepository.updateMinimumStock(minimumStock);
}

/**
 * Status stok mengikuti Batas Minimum Stok yang berlaku:
 * - stok = 0            -> "habis"
 * - stok <= batas minimum -> "menipis"
 * - stok > batas minimum  -> "aman"
 */
function statusForStock(stok, minimumStock) {
  if (stok <= 0) return "habis";
  if (stok <= minimumStock) return "menipis";
  return "aman";
}

/**
 * Mengelompokkan varian dengan stok menipis/habis per produk, dipakai widget
 * "Stok Menipis" di Dashboard Admin dan filter "Tampilkan hanya stok menipis"
 * di Manajemen Produk. Produk yang sudah dinonaktifkan (is_active = false)
 * tidak ikut ditampilkan.
 */
async function getLowStockReport() {
  const minimumStock = await stockRepository.getMinimumStock();
  const variants = await stockRepository.findLowStockVariants(minimumStock);

  const grouped = new Map();
  variants.forEach((variant) => {
    const product = variant.products;
    if (!product || product.is_active === false) return;

    if (!grouped.has(product.id)) {
      grouped.set(product.id, {
        productId: product.id,
        namaProduk: product.nama_produk,
        slug: product.slug,
        variants: [],
      });
    }

    grouped.get(product.id).variants.push({
      variantId: variant.id,
      ukuran: variant.ukuran,
      warna: variant.warna,
      sku: variant.sku,
      stok: variant.stok,
      status: statusForStock(variant.stok, minimumStock),
    });
  });

  return { minimumStock, items: Array.from(grouped.values()) };
}

module.exports = { adjustStock, getStockLogs, getMinimumStock, updateMinimumStock, getLowStockReport };
