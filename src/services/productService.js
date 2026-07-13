const productRepository = require("../repositories/productRepository");
const supabaseStorage = require("../storage/supabaseStorage");
const notificationService = require("./notificationService");
const { AppError } = require("../utils/AppError");
const { slugify } = require("../utils/slugify");
const promo = require("../utils/promo");

function toResponse(product) {
  return {
    id: product.id,
    kategoriId: product.category_id,
    namaProduk: product.nama_produk,
    slug: product.slug,
    harga: product.harga,
    hargaPromo: product.harga_promo ?? null,
    hargaPromoColor: product.harga_promo_color ?? "#dc2626",
    promoMulai: product.promo_mulai ?? null,
    promoSelesai: product.promo_selesai ?? null,
    // UPDATE 3 — dihitung sekali di backend (satu sumber kebenaran) supaya seluruh
    // halaman (Card Produk, Detail Produk, Pasangan Produk, Wishlist, Cart, Checkout)
    // menampilkan status promo yang konsisten dan sudah tervalidasi periode aktifnya.
    isPromoActive: promo.isPromoActive(product),
    isNewArrival: product.is_new_arrival ?? false,
    gender: product.gender ?? "uniseks",
    deskripsi: product.deskripsi,
    berat: product.berat,
    isActive: product.is_active,
    createdAt: product.created_at,
    // UPDATE 5 — Detail Produk dapat Dikelola per Produk. null/kosong ditangani
    // di frontend dengan pesan "Informasi belum tersedia." supaya layout konsisten.
    detailInfo: product.detail_info ?? null,
    materialCareInfo: product.material_care_info ?? null,
    shippingReturnInfo: product.shipping_return_info ?? null,
    productionInfo: product.production_info ?? null,
    images: (product.product_images || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => ({
        id: img.id,
        imageUrl: img.image_url,
        sortOrder: img.sort_order,
        warna: img.warna ?? null,
        // UPDATE 3 — dipakai frontend untuk menampilkan icon "Pasangan Produk"
        // pada foto gallery yang punya pasangan (product_image_pairs).
        hasPairs: (img.product_image_pairs || []).length > 0,
      })),
    variants: (product.product_variants || []).map((v) => ({
      id: v.id,
      ukuran: v.ukuran,
      warna: v.warna,
      sku: v.sku,
      stok: v.stok,
    })),
    // UPDATE 4 — Fitur Produk dengan Gambar. Produk lama yang belum punya baris
    // di product_features akan menerima array kosong (frontend fallback ke teks deskripsi).
    features: (product.product_features || [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((f) => ({
        id: f.id,
        imageUrl: f.image_url,
        deskripsi: f.deskripsi,
        sortOrder: f.sort_order,
      })),
  };
}

function pairedProductToResponse(pair) {
  const p = pair.paired_product;
  const cover = (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: p.id,
    namaProduk: p.nama_produk,
    slug: p.slug,
    harga: p.harga,
    imageUrl: cover?.image_url ?? null,
  };
}

/**
 * UPDATE 3 — sama seperti pairedProductToResponse, tapi untuk pasangan produk
 * per foto Gallery: menyertakan info tambahan yang diminta di halaman
 * "Pasangan Produk" (warna, status promo, badge New Arrival).
 */
function pairedImageProductToResponse(pair) {
  const p = pair.paired_product;
  const images = (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
  const cover = images[0];
  const isPromoActive = promo.isPromoActive(p);
  return {
    id: p.id,
    namaProduk: p.nama_produk,
    slug: p.slug,
    harga: p.harga,
    hargaPromo: p.harga_promo ?? null,
    hargaPromoColor: p.harga_promo_color ?? "#dc2626",
    isPromoActive,
    isNewArrival: p.is_new_arrival ?? false,
    warna: cover?.warna ?? null,
    imageUrl: cover?.image_url ?? null,
  };
}

async function getProducts({ categoryId, search, page, pageSize }) {
  const { data, total } = await productRepository.findAll({ categoryId, search, page, pageSize });
  return {
    items: data.map(toResponse),
    meta: { page: Number(page) || 1, pageSize: Number(pageSize) || 12, total },
  };
}

async function getProductById(id) {
  const product = await productRepository.findById(id);
  if (!product) throw new AppError("Produk tidak ditemukan", 404);
  return toResponse(product);
}

async function getProductBySlug(slug) {
  const product = await productRepository.findBySlug(slug);
  if (!product) throw new AppError("Produk tidak ditemukan", 404);
  return toResponse(product);
}

async function createProduct(payload) {
  const slug = slugify(payload.namaProduk);
  const product = await productRepository.create({ ...payload, slug });
  const response = toResponse(product);
  // Update 1 — Notifikasi New Arrival/Promo saat produk baru langsung dibuat dengan status tsb.
  // Jangan sampai kegagalan pengiriman notifikasi menggagalkan pembuatan produk itu sendiri.
  if (response.isNewArrival) notificationService.notifyNewArrival(response).catch(() => {});
  if (response.hargaPromo != null) notificationService.notifyPromo(response).catch(() => {});
  return response;
}

async function updateProduct(id, payload) {
  const before = await getProductById(id);
  const fields = {
    ...(payload.namaProduk && { nama_produk: payload.namaProduk, slug: slugify(payload.namaProduk) }),
    ...(payload.categoriId && { category_id: payload.categoriId }),
    ...(payload.categoryId && { category_id: payload.categoryId }),
    ...(payload.harga !== undefined && { harga: payload.harga }),
    ...(payload.hargaPromo !== undefined && {
      harga_promo: payload.hargaPromo === null || payload.hargaPromo === "" ? null : Number(payload.hargaPromo),
    }),
    ...(payload.hargaPromoColor !== undefined && { harga_promo_color: payload.hargaPromoColor || "#dc2626" }),
    ...(payload.promoMulai !== undefined && { promo_mulai: payload.promoMulai || null }),
    ...(payload.promoSelesai !== undefined && { promo_selesai: payload.promoSelesai || null }),
    ...(typeof payload.isNewArrival === "boolean" && { is_new_arrival: payload.isNewArrival }),
    ...(payload.gender && { gender: payload.gender }),
    ...(payload.deskripsi && { deskripsi: payload.deskripsi }),
    ...(payload.berat !== undefined && { berat: payload.berat }),
    ...(typeof payload.isActive === "boolean" && { is_active: payload.isActive }),
    // UPDATE 5 — Detail Produk dapat Dikelola per Produk (opsional, boleh dikosongkan lagi).
    ...(payload.detailInfo !== undefined && { detail_info: payload.detailInfo || null }),
    ...(payload.materialCareInfo !== undefined && { material_care_info: payload.materialCareInfo || null }),
    ...(payload.shippingReturnInfo !== undefined && { shipping_return_info: payload.shippingReturnInfo || null }),
    ...(payload.productionInfo !== undefined && { production_info: payload.productionInfo || null }),
  };
  const product = await productRepository.updateById(id, fields);
  const response = toResponse(product);

  // Update 1 — Notifikasi New Arrival: hanya saat transisi false -> true, supaya tidak
  // mengirim ulang notifikasi yang sama di setiap kali admin menyimpan perubahan lain.
  if (!before.isNewArrival && response.isNewArrival) {
    notificationService.notifyNewArrival(response).catch(() => {});
  }

  // Update 1 — Notifikasi Promo Produk: hanya saat harga promo/periode promo benar-benar
  // berubah (baru dibuat atau diperbarui), bukan setiap kali produk disimpan.
  const promoChanged =
    before.hargaPromo !== response.hargaPromo ||
    before.promoMulai !== response.promoMulai ||
    before.promoSelesai !== response.promoSelesai;
  if (promoChanged && response.hargaPromo != null) {
    notificationService.notifyPromo(response).catch(() => {});
  }

  return response;
}

async function deleteProduct(id) {
  await getProductById(id);
  await productRepository.deleteById(id);
  return true;
}

/**
 * warna kosong/null -> foto galeri umum (perilaku lama, boleh banyak).
 * warna terisi -> "foto utama" khusus warna itu; kalau sudah ada foto utama
 * untuk warna yang sama, foto lama diganti (upsert) bukan menambah baris baru.
 */
async function addProductImage(productId, { imageUrl, imagePath, sortOrder = 0, warna = null }) {
  await getProductById(productId);

  if (warna) {
    const existing = await productRepository.findColorImage(productId, warna);
    if (existing) {
      if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
      return productRepository.updateImage(existing.id, { image_url: imageUrl, image_path: imagePath });
    }
  }

  return productRepository.addImage(productId, { imageUrl, imagePath, sortOrder, warna });
}

async function removeProductImage(imageId) {
  const existing = await productRepository.findImageById(imageId);
  if (!existing) throw new AppError("Gambar tidak ditemukan", 404);
  if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
  return productRepository.deleteImage(imageId);
}

// --- Product Features (UPDATE 4 — Fitur Produk dengan Gambar) ---
// UPDATE 6 — Judul Fitur dihapus: tidak lagi diterima, disimpan, maupun
// dikembalikan lewat API. Kolom `judul` di tabel `product_features` boleh
// masih berisi data lama, tapi nilainya diabaikan sepenuhnya di sini.
function featureToResponse(feature) {
  return {
    id: feature.id,
    imageUrl: feature.image_url,
    deskripsi: feature.deskripsi,
    sortOrder: feature.sort_order,
  };
}

async function addProductFeature(productId, { imageUrl, imagePath, deskripsi, sortOrder }) {
  await getProductById(productId);
  let nextSortOrder = sortOrder;
  if (nextSortOrder === undefined) {
    const existing = await productRepository.findFeaturesByProductId(productId);
    nextSortOrder = existing.length;
  }
  const feature = await productRepository.addFeature(productId, {
    imageUrl,
    imagePath,
    deskripsi,
    sortOrder: nextSortOrder,
  });
  return featureToResponse(feature);
}

async function updateProductFeature(featureId, payload) {
  const existing = await productRepository.findFeatureById(featureId);
  if (!existing) throw new AppError("Fitur produk tidak ditemukan", 404);

  // Ganti gambar lama kalau ada gambar baru diupload.
  if (payload.imageUrl !== undefined && existing.image_path) {
    await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
  }

  const fields = {
    ...(payload.imageUrl !== undefined && { image_url: payload.imageUrl, image_path: payload.imagePath ?? null }),
    ...(payload.deskripsi !== undefined && { deskripsi: payload.deskripsi }),
    ...(payload.sortOrder !== undefined && { sort_order: Number(payload.sortOrder) }),
  };
  const feature = await productRepository.updateFeature(featureId, fields);
  return featureToResponse(feature);
}

async function removeProductFeature(featureId) {
  const existing = await productRepository.findFeatureById(featureId);
  if (!existing) throw new AppError("Fitur produk tidak ditemukan", 404);
  if (existing.image_path) await supabaseStorage.deleteImage(existing.image_path).catch(() => null);
  return productRepository.deleteFeature(featureId);
}

async function addProductVariant(productId, payload) {
  await getProductById(productId);
  return productRepository.addVariant(productId, payload);
}

async function updateProductVariant(variantId, payload) {
  const existing = await productRepository.findVariantById(variantId);
  if (!existing) throw new AppError("Varian tidak ditemukan", 404);

  const fields = {
    ...(payload.ukuran !== undefined && { ukuran: payload.ukuran }),
    ...(payload.warna !== undefined && { warna: payload.warna }),
    ...(payload.sku !== undefined && { sku: payload.sku }),
    ...(payload.stok !== undefined && { stok: Number(payload.stok) }),
  };
  return productRepository.updateVariant(variantId, fields);
}

async function removeProductVariant(variantId) {
  const existing = await productRepository.findVariantById(variantId);
  if (!existing) throw new AppError("Varian tidak ditemukan", 404);
  return productRepository.deleteVariant(variantId);
}

// --- Pasangan Produk ---
async function getProductPairs(productId) {
  await getProductById(productId);
  const pairs = await productRepository.findPairsByProductId(productId);
  return pairs.filter((p) => p.paired_product).map(pairedProductToResponse);
}

async function addProductPair(productId, sku) {
  await getProductById(productId);
  const pairedProductId = await productRepository.findProductIdBySku(sku);
  if (!pairedProductId) throw new AppError("SKU tidak ditemukan", 404);
  if (pairedProductId === productId) throw new AppError("Tidak bisa memasangkan produk dengan dirinya sendiri", 400);

  await productRepository.createPair(productId, pairedProductId);
  return getProductPairs(productId);
}

async function removeProductPair(productId, pairedProductId) {
  await getProductById(productId);
  await productRepository.deletePair(productId, pairedProductId);
  return getProductPairs(productId);
}

// --- Pasangan Produk per Foto Gallery (UPDATE 3) ---

/** Info "Produk Utama" (foto yang dipilih user) untuk header halaman Pasangan Produk. */
async function getImagePairingContext(imageId) {
  const image = await productRepository.findImageWithProduct(imageId);
  if (!image || !image.product) throw new AppError("Foto produk tidak ditemukan", 404);
  return {
    imageId: image.id,
    imageUrl: image.image_url,
    warna: image.warna ?? null,
    product: {
      id: image.product.id,
      namaProduk: image.product.nama_produk,
      slug: image.product.slug,
      harga: image.product.harga,
    },
  };
}

async function getProductImagePairs(imageId) {
  const image = await productRepository.findImageWithProduct(imageId);
  if (!image) throw new AppError("Foto produk tidak ditemukan", 404);
  const pairs = await productRepository.findImagePairsByImageId(imageId);
  return pairs.filter((p) => p.paired_product).map(pairedImageProductToResponse);
}

async function addProductImagePair(imageId, pairedProductId) {
  const image = await productRepository.findImageWithProduct(imageId);
  if (!image) throw new AppError("Foto produk tidak ditemukan", 404);
  if (!pairedProductId) throw new AppError("Produk pasangan wajib dipilih", 400);
  if (pairedProductId === image.product_id) {
    throw new AppError("Tidak bisa memasangkan produk dengan dirinya sendiri", 400);
  }
  // Pastikan produk pasangan memang ada.
  await getProductById(pairedProductId);

  await productRepository.createImagePair(imageId, pairedProductId);
  return getProductImagePairs(imageId);
}

async function removeProductImagePair(imageId, pairedProductId) {
  const image = await productRepository.findImageWithProduct(imageId);
  if (!image) throw new AppError("Foto produk tidak ditemukan", 404);
  await productRepository.deleteImagePair(imageId, pairedProductId);
  return getProductImagePairs(imageId);
}

module.exports = {
  toResponse,
  getProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImage,
  removeProductImage,
  addProductFeature,
  updateProductFeature,
  removeProductFeature,
  addProductVariant,
  updateProductVariant,
  removeProductVariant,
  getProductPairs,
  addProductPair,
  removeProductPair,
  getImagePairingContext,
  getProductImagePairs,
  addProductImagePair,
  removeProductImagePair,
};
