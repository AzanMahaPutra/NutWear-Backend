const reviewRepository = require("../repositories/reviewRepository");
const orderRepository = require("../repositories/orderRepository");
const { AppError } = require("../utils/AppError");

/**
 * UPDATE 7 — `purchaseInfo` diambil dari order_items (lewat order_item_id) yang
 * menjadi sumber ulasan ini, bukan data statis/hardcode. Bernilai null untuk
 * ulasan lama (dibuat sebelum UPDATE 7) yang belum tercatat order_item_id-nya.
 */
function toResponse(review) {
  const productImages = (review.products?.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
  const productVariants = review.products?.product_variants || [];
  const purchasedItem = review.order_items || null;

  return {
    id: review.id,
    productId: review.product_id,
    productName: review.products?.nama_produk,
    productSku: productVariants[0]?.sku ?? null,
    productThumbnail: productImages[0]?.image_url ?? null,
    userName: review.users?.nama_lengkap,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.created_at,
    orderId: review.order_id ?? null,
    // UPDATE — Moderasi Review: status "ditampilkan" | "disembunyikan".
    status: review.status ?? "ditampilkan",
    purchaseInfo: purchasedItem
      ? {
          productName: purchasedItem.product_name ?? null,
          ukuran: purchasedItem.variant_ukuran ?? null,
          warna: purchasedItem.variant_warna ?? null,
          quantity: purchasedItem.quantity ?? null,
        }
      : null,
  };
}

async function getReviewsByProduct(productId) {
  const reviews = await reviewRepository.findByProduct(productId);
  const summary = await reviewRepository.getAverageRating(productId);
  return { items: reviews.map(toResponse), summary };
}

// UPDATE — Filter Review berdasarkan Produk (Review Admin): `productId` diteruskan
// ke reviewRepository.findAll supaya filter dilakukan di database, bukan di frontend.
async function getAllReviews({ rating, productId } = {}) {
  const reviews = await reviewRepository.findAll({ rating, productId });
  return reviews.map(toResponse);
}

/**
 * UPDATE 7 — Ulasan sekarang hanya boleh dibuat dari sebuah pesanan (order)
 * yang benar-benar berisi produk tersebut & sudah berstatus "Selesai". Seluruh
 * validasi dilakukan di backend (tidak mengandalkan frontend) supaya request
 * manual yang tidak memenuhi syarat tetap ditolak API:
 * 1. Pesanan harus ada & milik user yang sedang login.
 * 2. Status pesanan harus "selesai".
 * 3. orderItemId harus benar-benar salah satu item pada pesanan tersebut,
 *    dan productId yang dikirim harus sesuai dengan produk pada item itu.
 * 4. User belum pernah membuat ulasan untuk produk ini pada pesanan yang sama
 *    (satu ulasan per produk per pesanan — lihat juga unique index database
 *    reviews_order_product_unique sebagai jaring pengaman race condition).
 */
async function createReview(userId, { orderId, orderItemId, productId, rating, comment }) {
  const order = await orderRepository.findById(orderId);
  if (!order || order.user_id !== userId) {
    throw new AppError("Pesanan tidak ditemukan", 404);
  }

  if (order.status !== "selesai") {
    throw new AppError("Ulasan hanya dapat diberikan untuk pesanan yang berstatus Selesai", 400);
  }

  const orderItem = (order.order_items || []).find((oi) => oi.id === orderItemId);
  if (!orderItem) {
    throw new AppError("Item pesanan tidak ditemukan pada pesanan ini", 404);
  }
  if (orderItem.product_id !== productId) {
    throw new AppError("Produk tidak sesuai dengan item pesanan yang dipilih", 400);
  }

  const existing = await reviewRepository.findByOrderAndProduct(orderId, productId);
  if (existing) {
    throw new AppError(
      "Anda sudah memberi ulasan untuk produk ini pada pesanan tersebut. Silakan gunakan fitur Edit Ulasan.",
      409
    );
  }

  const review = await reviewRepository.create({ userId, productId, orderId, orderItemId, rating, comment });
  const full = await reviewRepository.findById(review.id);
  return toResponse(full);
}

/**
 * UPDATE 7 — Edit Ulasan: melakukan UPDATE terhadap review yang sudah ada,
 * tidak pernah membuat baris review baru. Hanya pemilik ulasan yang boleh
 * mengeditnya.
 */
async function updateReview(userId, reviewId, { rating, comment }) {
  const review = await reviewRepository.findById(reviewId);
  if (!review) throw new AppError("Ulasan tidak ditemukan", 404);
  if (review.user_id !== userId) {
    throw new AppError("Anda tidak memiliki akses untuk mengubah ulasan ini", 403);
  }

  const updated = await reviewRepository.update(reviewId, { rating, comment });
  const full = await reviewRepository.findById(updated.id);
  return toResponse(full);
}

async function deleteReview(id) {
  await reviewRepository.deleteById(id);
  return true;
}

/**
 * UPDATE — Moderasi Review: Admin menyembunyikan/menampilkan review tanpa
 * menghapusnya dari database. Review tidak ditemukan -> 404.
 */
async function setReviewStatus(id, status) {
  if (!["ditampilkan", "disembunyikan"].includes(status)) {
    throw new AppError("Status review tidak valid", 400);
  }

  const existing = await reviewRepository.findById(id);
  if (!existing) throw new AppError("Ulasan tidak ditemukan", 404);

  const updated = await reviewRepository.updateStatus(id, status);
  const full = await reviewRepository.findById(updated.id);
  return toResponse(full);
}

module.exports = {
  getReviewsByProduct,
  getAllReviews,
  createReview,
  updateReview,
  deleteReview,
  setReviewStatus,
};
