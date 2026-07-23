const stockRepository = require("../repositories/stockRepository");
const productRepository = require("../repositories/productRepository");
const { AppError } = require("../utils/AppError");

/**
 * Business logic penyesuaian stok manual oleh admin (mis. restock, koreksi stok opname).
 * Terpisah dari pengurangan stok otomatis saat checkout (lihat orderService).
 * `adminId` opsional — kalau diisi, ikut dicatat di Riwayat Perubahan Stok
 * (lihat UPDATE — Halaman Inventory Stock Admin).
 */
async function adjustStock(variantId, { quantity, type }, adminId = null) {
  const variant = await productRepository.findVariantById(variantId);
  if (!variant) throw new AppError("Varian tidak ditemukan", 404);

  if (type === "in") {
    await stockRepository.increaseStock(variantId, quantity, { adminId });
  } else if (type === "out") {
    await stockRepository.decreaseStock(variantId, quantity, { adminId });
  } else {
    throw new AppError("Tipe penyesuaian stok tidak valid", 400);
  }

  return productRepository.findVariantById(variantId);
}

async function getStockLogs(variantId) {
  const logs = await stockRepository.findLogsByVariant(variantId);
  return logs.map((log) => ({
    id: log.id,
    variantId: log.variant_id,
    namaProduk: log.product_variants?.products?.nama_produk ?? null,
    ukuran: log.product_variants?.ukuran ?? null,
    warna: log.product_variants?.warna ?? null,
    sku: log.product_variants?.sku ?? null,
    quantity: log.quantity,
    type: log.type,
    stokSebelum: log.stok_sebelum,
    stokSesudah: log.stok_sesudah,
    selisih: log.stok_sebelum != null && log.stok_sesudah != null ? log.stok_sesudah - log.stok_sebelum : log.quantity,
    adminNama: log.users?.nama_lengkap ?? null,
    createdAt: log.created_at,
  }));
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

/**
 * Memilih satu foto yang paling relevan untuk sebuah varian: foto yang
 * warnanya cocok dengan warna varian (lihat product_images.warna, diisi saat
 * Admin upload foto utama khusus warna), jika tidak ada pakai foto pertama
 * (berdasarkan sort_order), atau null kalau produk belum punya foto sama sekali.
 */
function pickVariantImage(images, warna) {
  if (!images || images.length === 0) return null;
  const byColor = images.find((img) => img.warna && img.warna.toLowerCase() === String(warna).toLowerCase());
  if (byColor) return byColor.image_url;
  const sorted = [...images].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return sorted[0]?.image_url ?? null;
}

/**
 * UPDATE — Halaman Inventory Stock Admin.
 *
 * Daftar seluruh varian produk (satu baris per varian) dengan Search Produk/SKU,
 * Filter Status Stok, dan pagination — seluruhnya dihitung backend/database
 * (lihat stockRepository.findInventory), supaya halaman tetap cepat walau
 * produk sudah ribuan dan varian puluhan ribu.
 */
async function getInventory({ search, status, page, pageSize }) {
  const minimumStock = await stockRepository.getMinimumStock();
  const pageNum = Math.max(Number(page) || 1, 1);
  const pageSizeNum = Math.min(Math.max(Number(pageSize) || 20, 1), 100);

  const { data, total } = await stockRepository.findInventory({
    search: search?.trim(),
    status: ["aman", "menipis", "habis"].includes(status) ? status : undefined,
    minimumStock,
    page: pageNum,
    pageSize: pageSizeNum,
  });

  const items = data.map((variant) => {
    const product = variant.products;
    return {
      variantId: variant.id,
      productId: product?.id ?? variant.product_id,
      namaProduk: product?.nama_produk ?? "-",
      slug: product?.slug ?? null,
      warna: variant.warna,
      ukuran: variant.ukuran,
      sku: variant.sku,
      stok: variant.stok,
      status: statusForStock(variant.stok, minimumStock),
      imageUrl: pickVariantImage(product?.product_images, variant.warna),
    };
  });

  return { items, minimumStock, meta: { page: pageNum, pageSize: pageSizeNum, total } };
}

/**
 * UPDATE — Halaman Inventory Stock Admin (modal Edit Stok + tombol Quick
 * Adjustment +5/+10/-5/-10). Admin selalu mengirim nilai stok akhir yang
 * diinginkan (`stokBaru`) — untuk Quick Adjustment, nilainya sudah dihitung
 * di frontend dari stok yang sedang ditampilkan. Validasi angka non-negatif
 * sudah dilakukan di validator (stockValidator.js) sebelum masuk ke sini;
 * di sini cukup pastikan variannya memang ada.
 */
async function setInventoryStock(variantId, stokBaru, adminId) {
  const variant = await productRepository.findVariantById(variantId);
  if (!variant) throw new AppError("Varian tidak ditemukan", 404);

  const stokBaruNum = Number(stokBaru);
  if (!Number.isInteger(stokBaruNum) || stokBaruNum < 0) {
    throw new AppError("Stok harus berupa angka dan tidak boleh negatif", 400);
  }

  await stockRepository.setVariantStock(variantId, stokBaruNum, { adminId });

  const minimumStock = await stockRepository.getMinimumStock();
  const updated = await productRepository.findVariantById(variantId);
  return { ...updated, status: statusForStock(updated.stok, minimumStock) };
}

module.exports = {
  adjustStock,
  getStockLogs,
  getMinimumStock,
  updateMinimumStock,
  getLowStockReport,
  getInventory,
  setInventoryStock,
};
