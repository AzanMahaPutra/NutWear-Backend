const cartRepository = require("../repositories/cartRepository");
const productRepository = require("../repositories/productRepository");
const { AppError } = require("../utils/AppError");
const promo = require("../utils/promo");

/**
 * UPDATE 3 — Perbaikan bug harga promo di Cart.
 *
 * Penyebab bug: CART_SELECT & toResponse sebelumnya hanya mengambil/mengembalikan
 * `harga` (harga normal) dari tabel products, tidak pernah menyertakan harga_promo/
 * promo_mulai/promo_selesai sama sekali. Akibatnya Cart, Subtotal, dan Total selalu
 * memakai harga normal walau produk sedang promo di Card Produk & Detail Produk.
 *
 * Perbaikan: gunakan util promo (satu sumber kebenaran, sama seperti yang dipakai
 * productService & orderService) untuk menentukan status promo dan harga efektif.
 * `harga` tetap dikembalikan (harga normal, dipakai untuk strikethrough), ditambah
 * `hargaPromo`, `hargaPromoColor`, `isPromoActive`, dan `hargaEfektif` (harga yang
 * benar-benar dipakai untuk Subtotal/Total) supaya frontend tidak perlu menghitung
 * ulang/menebak logika promo sendiri.
 */
function toResponse(item) {
  const variant = item.product_variants;
  const product = variant?.products;
  const cover = (product?.product_images || []).sort((a, b) => a.sort_order - b.sort_order)[0];
  const isPromoActive = promo.isPromoActive(product);

  return {
    id: item.id,
    variantId: variant?.id,
    productId: product?.id,
    namaProduk: product?.nama_produk,
    slug: product?.slug,
    imageUrl: cover?.image_url ?? null,
    warna: variant?.warna,
    ukuran: variant?.ukuran,
    harga: product?.harga,
    hargaPromo: product?.harga_promo ?? null,
    hargaPromoColor: product?.harga_promo_color ?? "#dc2626",
    isPromoActive,
    hargaEfektif: product ? promo.getEffectivePrice(product) : product?.harga,
    quantity: item.quantity,
    stokTersedia: variant?.stok,
  };
}

async function getCart(userId) {
  const items = await cartRepository.findAllByUser(userId);
  return items.map(toResponse);
}

async function addToCart(userId, { variantId, quantity }) {
  const variant = await productRepository.findVariantById(variantId);
  if (!variant) throw new AppError("Varian produk tidak ditemukan", 404);
  if (variant.stok < quantity) throw new AppError("Stok tidak mencukupi", 400);

  const existing = await cartRepository.findOne(userId, variantId);
  if (existing) {
    const newQty = existing.quantity + quantity;
    if (variant.stok < newQty) throw new AppError("Stok tidak mencukupi", 400);
    return cartRepository.updateQuantity(existing.id, newQty);
  }
  return cartRepository.create(userId, variantId, quantity);
}

async function updateCartItem(userId, cartId, quantity) {
  const item = await cartRepository.findById(cartId);
  if (!item || item.user_id !== userId) throw new AppError("Item keranjang tidak ditemukan", 404);

  const variant = await productRepository.findVariantById(item.variant_id);
  if (variant.stok < quantity) throw new AppError("Stok tidak mencukupi", 400);

  return cartRepository.updateQuantity(cartId, quantity);
}

async function removeCartItem(userId, cartId) {
  const item = await cartRepository.findById(cartId);
  if (!item || item.user_id !== userId) throw new AppError("Item keranjang tidak ditemukan", 404);
  return cartRepository.deleteById(cartId);
}

async function clearCart(userId) {
  return cartRepository.deleteAllByUser(userId);
}

module.exports = { getCart, addToCart, updateCartItem, removeCartItem, clearCart };
