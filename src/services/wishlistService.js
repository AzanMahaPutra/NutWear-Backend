const wishlistRepository = require("../repositories/wishlistRepository");
const { AppError } = require("../utils/AppError");
const promo = require("../utils/promo");

function toResponse(item) {
  const product = item.products;
  const cover = (product?.product_images || []).sort((a, b) => a.sort_order - b.sort_order)[0];
  return {
    id: item.id,
    productId: product?.id,
    namaProduk: product?.nama_produk,
    slug: product?.slug,
    harga: product?.harga,
    hargaPromo: product?.harga_promo ?? null,
    hargaPromoColor: product?.harga_promo_color ?? "#dc2626",
    isPromoActive: promo.isPromoActive(product),
    imageUrl: cover?.image_url ?? null,
    createdAt: item.created_at,
  };
}

async function getWishlist(userId) {
  const items = await wishlistRepository.findAllByUser(userId);
  return items.map(toResponse);
}

async function addToWishlist(userId, productId) {
  const existing = await wishlistRepository.findOne(userId, productId);
  if (existing) throw new AppError("Produk sudah ada di wishlist", 409);
  return wishlistRepository.create(userId, productId);
}

async function removeFromWishlist(userId, productId) {
  await wishlistRepository.deleteByProduct(userId, productId);
  return true;
}

module.exports = { getWishlist, addToWishlist, removeFromWishlist };
