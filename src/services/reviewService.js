const reviewRepository = require("../repositories/reviewRepository");
const { AppError } = require("../utils/AppError");

function toResponse(review) {
  const productImages = (review.products?.product_images || []).sort((a, b) => a.sort_order - b.sort_order);
  const productVariants = review.products?.product_variants || [];

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
  };
}

async function getReviewsByProduct(productId) {
  const reviews = await reviewRepository.findByProduct(productId);
  const summary = await reviewRepository.getAverageRating(productId);
  return { items: reviews.map(toResponse), summary };
}

async function getAllReviews({ rating } = {}) {
  const reviews = await reviewRepository.findAll({ rating });
  return reviews.map(toResponse);
}

async function createReview(userId, { productId, rating, comment }) {
  const existing = await reviewRepository.findOne(userId, productId);
  if (existing) throw new AppError("Anda sudah memberi ulasan untuk produk ini", 409);

  const review = await reviewRepository.create({ userId, productId, rating, comment });
  return toResponse(review);
}

async function deleteReview(id) {
  await reviewRepository.deleteById(id);
  return true;
}

module.exports = { getReviewsByProduct, getAllReviews, createReview, deleteReview };
