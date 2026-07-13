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

module.exports = { adjustStock, getStockLogs };
